// src/features/sync/syncEngine.ts
//
// 동기화 엔진 — 결정(computeSyncPlan, 순수) + 오케스트레이션(runSync, I/O).
// BYO-storage: 노트별 {uuid}.enc(DEK 암호화) + manifest.json(인덱스+tombstone).
// 충돌 = LWW + conflict copy. zero-knowledge: 평문은 절대 프로바이더로 가지 않는다.

import { nanoid } from 'nanoid'
import { db } from '../../core/db'
import type { Item, Folder } from '../../core/db'
import { encrypt, decrypt } from '../../core/crypto'
import { importDEK, importHmacKey } from '../../core/sync-crypto'
import {
  emptyManifest,
  isEncryptedNoteFile,
  isSyncManifest,
} from './sync-schema'
import type { SyncManifest, SyncNotePayload, EncryptedNoteFile } from './sync-schema'
import type { StorageProvider } from './providers/StorageProvider'

export interface LocalNoteState {
  uuid: string
  version: string // 현재 로컬 페이로드 해시
  syncedVersion?: string // base: 마지막으로 동기화된 버전 (undefined = 미동기화)
  updatedAt: number
  deleted?: boolean // 로컬에서 삭제됨 (tombstone 대기)
}

export interface SyncPlan {
  toPush: string[] // 로컬 → 원격 업로드
  toPull: string[] // 원격 → 로컬 다운로드
  conflicts: string[] // 양쪽 변경 → 충돌 사본
  toTombstone: string[] // 로컬 삭제 → tombstone 기록 + 원격 파일 제거
  toDeleteLocal: string[] // 원격 tombstone → 로컬 노트 삭제
}

/**
 * 로컬 상태 vs 원격 manifest를 base(syncedVersion) 기준 3-way로 비교해 동기화 계획을 산출한다.
 * 순수 함수(I/O 없음) — 충돌 = LWW + conflict copy(별도 사본). CRDT 없음.
 * 출력 배열은 uuid 오름차순 정렬로 재현성 보장.
 */
export function computeSyncPlan(
  locals: LocalNoteState[],
  manifest: SyncManifest,
): SyncPlan {
  const plan: SyncPlan = {
    toPush: [],
    toPull: [],
    conflicts: [],
    toTombstone: [],
    toDeleteLocal: [],
  }
  const localMap = new Map(locals.map((l) => [l.uuid, l]))
  const uuids = new Set<string>([
    ...locals.map((l) => l.uuid),
    ...Object.keys(manifest.notes),
    ...Object.keys(manifest.tombstones),
  ])

  for (const uuid of uuids) {
    const L = localMap.get(uuid)
    const R = manifest.notes[uuid]?.version // 원격 live 버전 (없으면 undefined)
    const tombstoned = manifest.tombstones[uuid] !== undefined

    // ── 로컬에 없음 ──
    if (!L) {
      if (R !== undefined) plan.toPull.push(uuid) // 다른 기기 신규/변경
      // 원격 tombstone & 로컬 없음 → 이미 삭제됨, 아무것도 안 함 (부활 방지)
      continue
    }

    const base = L.syncedVersion

    // ── 로컬 삭제됨 ──
    if (L.deleted) {
      if (R !== undefined) {
        if (R === base) plan.toTombstone.push(uuid) // 원격 base 유지 → 삭제 전파
        else plan.conflicts.push(uuid) // 원격이 base 이후 변경 → 삭제-편집 충돌
      }
      // 원격도 tombstone이거나 원격 부재 → 아무것도 안 함
      continue
    }

    // ── 원격 tombstone (로컬 살아있음) ──
    if (tombstoned) {
      if (L.version === base) plan.toDeleteLocal.push(uuid) // 로컬 변경 없음 → 삭제 수용
      else plan.conflicts.push(uuid) // 로컬 변경됨 → 삭제-편집 충돌
      continue
    }

    // ── 원격 live ──
    if (R !== undefined) {
      if (L.version === R) continue // 동일 내용으로 수렴 → 마커만 갱신(전송 없음)
      const localChanged = L.version !== base
      const remoteChanged = R !== base
      if (localChanged && remoteChanged) plan.conflicts.push(uuid)
      else if (localChanged) plan.toPush.push(uuid)
      else if (remoteChanged) plan.toPull.push(uuid)
      continue
    }

    // ── 원격 부재(notes·tombstone 모두 없음) → 신규/재확립 업로드 ──
    plan.toPush.push(uuid)
  }

  plan.toPush.sort()
  plan.toPull.sort()
  plan.conflicts.sort()
  plan.toTombstone.sort()
  plan.toDeleteLocal.sort()
  return plan
}

// ─── 오케스트레이션 (I/O) ─────────────────────────────────────

const MANIFEST_FILE = 'manifest.json'
const NOTE_VERSION = 1

function noteFileName(uuid: string): string {
  return `${uuid}.enc`
}

/**
 * 콘텐츠 동등성 지문 — uuid·updatedAt 제외(같은 내용은 기기 무관 같은 버전).
 * DEK 기반 HMAC-SHA-256으로 키잉 → manifest/noteVersion에 평문 노출돼도 DEK 없는
 * 제3자는 콘텐츠 상관분석·오프라인 추측을 못 한다(무염 해시 오라클 차단).
 */
async function hashPayload(p: SyncNotePayload, hmacKey: CryptoKey): Promise<string> {
  const canonical = JSON.stringify([
    p.title, p.type, p.tags, p.content, p.pinned, p.folderPath, p.order, p.createdAt,
  ])
  const sig = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(canonical) as unknown as ArrayBuffer,
  )
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** folderId → 루트부터의 폴더명 경로 (기기 간 id 불일치 회피) */
async function folderIdToPath(folderId: number | null): Promise<string[]> {
  const path: string[] = []
  let current = folderId
  const guard = new Set<number>()
  while (current !== null && current !== undefined && !guard.has(current)) {
    guard.add(current)
    const folder = await db.folders.get(current)
    if (!folder) break
    path.unshift(folder.name)
    current = folder.parentId
  }
  return path
}

/** 폴더명 경로 → folderId. 없는 폴더는 생성한다. 빈 경로 → null(루트). */
async function ensureFolderPath(path: string[]): Promise<number | null> {
  let parentId: number | null = null
  for (const name of path) {
    // 폴더 수는 작으므로 전체 조회 후 메모리 필터(null parentId 인덱싱 회피)
    const all = await db.folders.toArray()
    const match: Folder | undefined = all.find((f) => f.parentId === parentId && f.name === name)
    if (match) {
      parentId = match.id
    } else {
      parentId = (await db.folders.add({
        parentId,
        name,
        order: Date.now(),
        createdAt: Date.now(),
      })) as number
    }
  }
  return parentId
}

async function itemToPayload(item: Item): Promise<SyncNotePayload> {
  return {
    uuid: item.uuid as string,
    title: item.title,
    type: item.type,
    tags: item.tags,
    content: item.content,
    pinned: item.pinned,
    folderPath: await folderIdToPath(item.folderId),
    order: item.order,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

/** uuid 미부여 노트에 지연 부여 후 로컬 상태 목록 구성(삭제 감지 포함). */
async function buildLocalStates(hmacKey: CryptoKey): Promise<LocalNoteState[]> {
  const items = await db.items.toArray()
  const states: LocalNoteState[] = []
  const liveUuids = new Set<string>()

  for (const item of items) {
    let uuid = item.uuid
    if (!uuid) {
      uuid = nanoid(16)
      await db.items.update(item.id, { uuid })
      item.uuid = uuid
    }
    liveUuids.add(uuid)
    const synced = await db.syncState.get(uuid)
    const version = await hashPayload(await itemToPayload(item), hmacKey)
    states.push({ uuid, version, syncedVersion: synced?.syncedVersion, updatedAt: item.updatedAt })
  }

  // syncState에는 있으나 items에 없음 = 로컬에서 삭제된 노트 → tombstone 후보
  const allSynced = await db.syncState.toArray()
  for (const s of allSynced) {
    if (!liveUuids.has(s.uuid)) {
      states.push({ uuid: s.uuid, version: '', syncedVersion: s.syncedVersion, updatedAt: 0, deleted: true })
    }
  }
  return states
}

async function readManifest(provider: StorageProvider, now: number): Promise<SyncManifest> {
  const raw = await provider.get(MANIFEST_FILE)
  if (raw === null) return emptyManifest(now)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('원격 manifest가 손상되었습니다')
  }
  if (!isSyncManifest(parsed)) throw new Error('원격 manifest 형식이 올바르지 않습니다')
  return parsed
}

async function pushNote(
  provider: StorageProvider, noteKey: CryptoKey, hmacKey: CryptoKey,
  item: Item, manifest: SyncManifest, now: number,
): Promise<void> {
  const payload = await itemToPayload(item)
  const version = await hashPayload(payload, hmacKey)
  const file: EncryptedNoteFile = {
    format: 'devnote-note',
    version: NOTE_VERSION,
    uuid: payload.uuid,
    noteVersion: version,
    ciphertext: await encrypt(JSON.stringify(payload), noteKey),
    updatedAt: item.updatedAt,
  }
  await provider.put(noteFileName(payload.uuid), JSON.stringify(file))
  manifest.notes[payload.uuid] = { version, updatedAt: now }
  delete manifest.tombstones[payload.uuid]
  await db.syncState.put({ uuid: payload.uuid, syncedVersion: version })
}

/** 원격 노트를 복호화해 페이로드를 얻는다. */
async function pullPayload(
  provider: StorageProvider, noteKey: CryptoKey, uuid: string,
): Promise<SyncNotePayload | null> {
  const raw = await provider.get(noteFileName(uuid))
  if (raw === null) return null
  const parsed: unknown = JSON.parse(raw)
  if (!isEncryptedNoteFile(parsed)) throw new Error(`원격 노트(${uuid}) 형식이 올바르지 않습니다`)
  const plaintext = await decrypt(parsed.ciphertext, noteKey)
  return JSON.parse(plaintext) as SyncNotePayload
}

/** 페이로드를 로컬 item으로 upsert(uuid 기준). conflictLabel 지정 시 새 사본으로 생성. */
async function applyPayload(
  payload: SyncNotePayload,
  conflict?: { uuid: string; label: string },
): Promise<void> {
  const uuid = conflict?.uuid ?? payload.uuid
  const folderId = await ensureFolderPath(payload.folderPath)
  const fields = {
    folderId,
    title: conflict ? `${payload.title} (충돌 사본 · ${conflict.label})` : payload.title,
    type: payload.type as Item['type'],
    tags: payload.tags,
    order: payload.order,
    pinned: payload.pinned,
    content: payload.content,
    updatedAt: payload.updatedAt,
    createdAt: payload.createdAt,
    uuid,
  }
  const existing = await db.items.where('uuid').equals(uuid).first()
  if (existing) await db.items.update(existing.id, fields)
  else await db.items.add(fields as Omit<Item, 'id'>)
}

export interface SyncResult {
  pushed: number
  pulled: number
  conflicts: number
  tombstoned: number
  deletedLocal: number
}

/**
 * 1회 동기화 실행. provider는 인증된 상태여야 한다. dek = unlock된 DEK(base64).
 * 노트 암호화 키(AES)와 버전 지문 키(HMAC)를 dek에서 함께 파생한다.
 * 계약: 시작 시 provider.list()로 프로바이더 캐시를 갱신한다(StorageProvider.list 참조).
 */
export async function runSync(
  provider: StorageProvider,
  dek: string,
  deviceId: string,
  now: number,
): Promise<SyncResult> {
  const noteKey = await importDEK(dek)
  const hmacKey = await importHmacKey(dek)
  await provider.list() // 캐시 갱신 계약
  const manifest = await readManifest(provider, now)
  const locals = await buildLocalStates(hmacKey)
  const plan = computeSyncPlan(locals, manifest)
  const result: SyncResult = { pushed: 0, pulled: 0, conflicts: 0, tombstoned: 0, deletedLocal: 0 }

  // 업로드
  for (const uuid of plan.toPush) {
    const item = await db.items.where('uuid').equals(uuid).first()
    if (!item) continue
    await pushNote(provider, noteKey, hmacKey, item, manifest, now)
    result.pushed++
  }

  // 다운로드
  for (const uuid of plan.toPull) {
    const payload = await pullPayload(provider, noteKey, uuid)
    if (!payload) continue
    await applyPayload(payload)
    await db.syncState.put({ uuid, syncedVersion: manifest.notes[uuid]?.version ?? await hashPayload(payload, hmacKey) })
    result.pulled++
  }

  // 충돌 — 두 경로 모두 같은 사이클 안에서 수렴(idempotent)해야 한다.
  for (const uuid of plan.conflicts) {
    const remote = await pullPayload(provider, noteKey, uuid)
    const item = await db.items.where('uuid').equals(uuid).first()
    if (item) {
      // 양쪽 편집 충돌: 원격본을 사본으로 보존 + 로컬을 정본으로 push (LWW=로컬 우선).
      // pushNote가 syncState/manifest를 로컬 버전으로 맞춰 다음 사이클에 수렴.
      if (remote) await applyPayload(remote, { uuid: nanoid(16), label: deviceId })
      await pushNote(provider, noteKey, hmacKey, item, manifest, now)
    } else if (remote) {
      // 삭제-편집 충돌(로컬 삭제 vs 원격 편집): 데이터 보존을 위해 원격 우선 — 원래 uuid로 복원.
      // syncState를 원격 버전(R)으로 맞춰 다음 사이클 buildLocalStates가 수렴(재충돌 방지).
      await applyPayload(remote)
      await db.syncState.put({ uuid, syncedVersion: manifest.notes[uuid]?.version ?? await hashPayload(remote, hmacKey) })
    } else {
      // 원격본도 사라짐 → 동기화 상태만 정리(다음 사이클 무충돌).
      await db.syncState.delete(uuid)
    }
    result.conflicts++
  }

  // 로컬 삭제 → tombstone 전파(원격 파일 제거)
  for (const uuid of plan.toTombstone) {
    await provider.remove(noteFileName(uuid))
    delete manifest.notes[uuid]
    manifest.tombstones[uuid] = { deletedAt: now }
    await db.syncState.delete(uuid)
    result.tombstoned++
  }

  // 원격 tombstone → 로컬 삭제
  for (const uuid of plan.toDeleteLocal) {
    const item = await db.items.where('uuid').equals(uuid).first()
    if (item) await db.items.delete(item.id)
    await db.syncState.delete(uuid)
    result.deletedLocal++
  }

  manifest.updatedAt = now
  await provider.put(MANIFEST_FILE, JSON.stringify(manifest))
  await db.config.update(1, { syncCursor: String(now), lastSyncAt: now })
  return result
}
