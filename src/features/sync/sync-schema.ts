// src/features/sync/sync-schema.ts
//
// 동기화 파일 포맷 정의 및 타입가드 (BYO-storage)
// - EncryptedNoteFile: 노트별 {uuid}.enc — DEK로 암호화된 노트 페이로드
// - SyncManifest: live 노트 인덱스 + tombstone(삭제 부활 방지)
// - SyncMeta: meta.json — salt + wrappedDEK + verifyToken (zero-knowledge 키 모델)
// 가드 패턴은 storage/schema.ts·envelope.ts와 동일(콘텐츠 신뢰 전 구조 검증).

// 복호화된 노트 페이로드 — EncryptedNoteFile.ciphertext의 평문 계약.
export interface SyncNotePayload {
  uuid: string
  title: string
  type: string
  tags: string[]
  content: string
  pinned: boolean
  folderPath: string[] // 폴더 id 대신 이름 경로 — 기기 간 id 불일치 회피
  order: number
  createdAt: number
  updatedAt: number
}

export interface EncryptedNoteFile {
  format: 'devnote-note'
  version: number
  uuid: string
  noteVersion: string // 페이로드 해시 — 변경 감지/충돌 판별
  ciphertext: string // encrypt(JSON.stringify(SyncNotePayload), DEK)
  updatedAt: number
}

export interface ManifestEntry {
  version: string
  updatedAt: number
}

export interface SyncManifest {
  format: 'devnote-manifest'
  version: number
  updatedAt: number
  notes: Record<string, ManifestEntry> // uuid → 현재 버전
  tombstones: Record<string, { deletedAt: number }> // uuid → 삭제 시각
}

export interface SyncMeta {
  format: 'devnote-sync-meta'
  version: number
  kdf: 'PBKDF2'
  iterations: number
  salt: string // hex — KEK 파생 salt (동기화 전용, 백업 봉투와 무관)
  wrappedDEK: string // wrapDEK(DEK, KEK)
  verifyToken: string // encrypt(상수, DEK) — 패스프레이즈/키 검증
}

const NOTE_FORMAT = 'devnote-note'
const MANIFEST_FORMAT = 'devnote-manifest'
const META_FORMAT = 'devnote-sync-meta'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function isStr(v: unknown): v is string {
  return typeof v === 'string'
}
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}
function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return isObject(v)
}

export function isEncryptedNoteFile(data: unknown): data is EncryptedNoteFile {
  if (!isObject(data)) return false
  return (
    data.format === NOTE_FORMAT &&
    isNum(data.version) &&
    isStr(data.uuid) &&
    isStr(data.noteVersion) &&
    isStr(data.ciphertext) &&
    isNum(data.updatedAt)
  )
}

export function isSyncManifest(data: unknown): data is SyncManifest {
  if (!isObject(data)) return false
  if (data.format !== MANIFEST_FORMAT) return false
  if (!isNum(data.version) || !isNum(data.updatedAt)) return false
  if (!isPlainRecord(data.notes) || !isPlainRecord(data.tombstones)) return false
  for (const entry of Object.values(data.notes)) {
    if (!isObject(entry) || !isStr(entry.version) || !isNum(entry.updatedAt)) return false
  }
  for (const tomb of Object.values(data.tombstones)) {
    if (!isObject(tomb) || !isNum(tomb.deletedAt)) return false
  }
  return true
}

export function isSyncMeta(data: unknown): data is SyncMeta {
  if (!isObject(data)) return false
  return (
    data.format === META_FORMAT &&
    isNum(data.version) &&
    data.kdf === 'PBKDF2' &&
    isNum(data.iterations) &&
    isStr(data.salt) &&
    isStr(data.wrappedDEK) &&
    isStr(data.verifyToken)
  )
}

/** 빈 manifest를 생성한다 (최초 동기화 시 클라우드에 없을 때). */
export function emptyManifest(now: number): SyncManifest {
  return {
    format: MANIFEST_FORMAT,
    version: 1,
    updatedAt: now,
    notes: {},
    tombstones: {},
  }
}
