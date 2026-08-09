// 동기화 × at-rest content 암호화 정합성 — 태그·폴더명과 같은 이유로 content도
// at-rest 암호문 그대로 페이로드에 실리면 DEK로 이중 암호화되어 상대 기기가
// 복호화하지 못한다(salt가 기기마다 달라 같은 패스프레이즈여도 키가 다르다).

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { db, ensureConfig } from '../core/db'
import { runSync } from '../features/sync/syncEngine'
import { generateDEK, importDEK } from '../core/sync-crypto'
import { decrypt } from '../core/crypto'
import { isEncryptedNoteFile } from '../features/sync/sync-schema'
import { deriveKey, generateSalt } from '../core/crypto'
import { encryptContent, isEncryptedContent } from '../core/content'
import type { StorageProvider, RemoteFile } from '../features/sync/providers/StorageProvider'
import type { Item, Folder } from '../core/db'

class FakeCloud implements StorageProvider {
  readonly id = 'google-drive' as const
  files = new Map<string, string>()
  authenticate(): Promise<void> { return Promise.resolve() }
  isAuthenticated(): boolean { return true }
  list(): Promise<RemoteFile[]> {
    return Promise.resolve([...this.files.keys()].map((name) => ({ name, id: name, modifiedTime: 0 })))
  }
  get(name: string): Promise<string | null> { return Promise.resolve(this.files.get(name) ?? null) }
  put(name: string, content: string): Promise<void> { this.files.set(name, content); return Promise.resolve() }
  remove(name: string): Promise<void> { this.files.delete(name); return Promise.resolve() }
  signOut(): void {}
}

let atRestKey: CryptoKey

beforeAll(async () => {
  atRestKey = await deriveKey('at-rest-passphrase', generateSalt())
})

async function reset() {
  await db.items.clear()
  await db.folders.clear()
  await db.syncState.clear()
  await db.config.clear()
  await ensureConfig()
}

async function readRemotePayload(cloud: FakeCloud, dek: string) {
  const name = [...cloud.files.keys()].find((n) => n.endsWith('.enc'))!
  const parsed: unknown = JSON.parse(cloud.files.get(name)!)
  expect(isEncryptedNoteFile(parsed)).toBe(true)
  const file = parsed as { ciphertext: string }
  const plain = await decrypt(file.ciphertext, await importDEK(dek))
  return JSON.parse(plain) as { content: string }
}

describe('동기화 페이로드는 at-rest content 암호문을 그대로 싣지 않는다', () => {
  beforeEach(reset)

  it('push된 페이로드의 content가 평문이다 — 암호문이면 DEK로 이중 암호화되어 상대 기기가 못 읽는다', async () => {
    const folderId = (await db.folders.add({
      parentId: null, name: '사내 인프라', order: 0, createdAt: 100,
    } as Omit<Folder, 'id'>)) as number
    const plainContent = '{"format":"legacy","text":"민감한 메모"}'
    await db.items.add({
      folderId, title: '운영 DB', type: 'db', tags: [],
      order: 0, pinned: false, content: await encryptContent(plainContent, atRestKey),
      updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)

    const cloud = new FakeCloud()
    const dek = generateDEK()
    await runSync(cloud, dek, 'deviceA', 1000, atRestKey)

    const payload = await readRemotePayload(cloud, dek)
    expect(payload.content).toBe(plainContent)
    expect(isEncryptedContent(payload.content)).toBe(false)
  })

  it('pull 시 content가 로컬 at-rest 키로 재암호화되어 저장된다', async () => {
    // 기기 A: at-rest 암호화 없이 평문으로 push
    await db.folders.add({ parentId: null, name: '공용폴더', order: 0, createdAt: 100 } as Omit<Folder, 'id'>)
    const folders = await db.folders.toArray()
    await db.items.add({
      folderId: folders[0].id, title: 'shared', type: 'note', tags: [],
      order: 0, pinned: false, content: '{"format":"legacy","text":"평문 메모"}',
      updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)
    const cloud = new FakeCloud()
    const dek = generateDEK()
    await runSync(cloud, dek, 'deviceA', 1000, null)

    // 기기 B: at-rest 암호화를 쓰는 기기가 pull
    await reset()
    await runSync(cloud, dek, 'deviceB', 2000, atRestKey)

    const item = (await db.items.toArray())[0]
    expect(isEncryptedContent(item.content)).toBe(true)
  })

  it('at-rest 암호화를 쓰지 않는 기기는 content를 평문 그대로 저장한다(기존 동작 유지)', async () => {
    await db.folders.add({ parentId: null, name: '공용폴더', order: 0, createdAt: 100 } as Omit<Folder, 'id'>)
    const folders = await db.folders.toArray()
    await db.items.add({
      folderId: folders[0].id, title: 'shared', type: 'note', tags: [],
      order: 0, pinned: false, content: '{"format":"legacy","text":"평문 메모"}',
      updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)
    const cloud = new FakeCloud()
    const dek = generateDEK()
    await runSync(cloud, dek, 'deviceA', 1000, null)

    await reset()
    await runSync(cloud, dek, 'deviceB', 2000, null)

    const item = (await db.items.toArray())[0]
    expect(item.content).toBe('{"format":"legacy","text":"평문 메모"}')
  })

  it('원격 페이로드의 content가 이미 암호문 형태이면 pull 시 이중 암호화하지 않는다(가드)', async () => {
    // 구버전 클라이언트(at-rest 미사용 기기)가 실수로 암호문처럼 보이는 content를 그대로
    // push했다고 가정 — atRestKey가 null인 기기는 content를 손대지 않고 그대로 실어 보낸다.
    await db.folders.add({ parentId: null, name: '레거시', order: 0, createdAt: 100 } as Omit<Folder, 'id'>)
    const folders = await db.folders.toArray()
    const looksEncrypted = '{"enc":1,"ct":"already-ciphertext-from-another-device"}'
    await db.items.add({
      folderId: folders[0].id, title: 'legacy', type: 'note', tags: [],
      order: 0, pinned: false, content: looksEncrypted,
      updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)
    const cloud = new FakeCloud()
    const dek = generateDEK()
    await runSync(cloud, dek, 'deviceA', 1000, null)

    // at-rest 암호화를 쓰는 기기가 pull — 이미 암호문 형태인 content를 자기 키로 한 번 더
    // 감싸면 어느 기기의 키로도 복호화할 수 없는 상태가 된다. 가드는 그대로 저장해야 한다.
    await reset()
    await runSync(cloud, dek, 'deviceB', 2000, atRestKey)

    const item = (await db.items.toArray())[0]
    expect(item.content).toBe(looksEncrypted)
  })
})
