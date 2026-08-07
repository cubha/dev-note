// 동기화 × at-rest 메타데이터 암호화 정합성 —
// 태그·폴더명이 at-rest 암호문 그대로 페이로드에 실리면 DEK로 이중 암호화되어
// 상대 기기가 복호화하지 못하고, ensureFolderPath의 이름 비교도 매번 실패한다.

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { db, ensureConfig } from '../core/db'
import { runSync } from '../features/sync/syncEngine'
import { generateDEK, importDEK } from '../core/sync-crypto'
import { decrypt } from '../core/crypto'
import { isEncryptedNoteFile } from '../features/sync/sync-schema'
import { deriveKey, generateSalt } from '../core/crypto'
import { encryptTags, encryptFolderName } from '../core/metaCrypto'
import { isEncryptedContent } from '../core/content'
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

/** 원격 {uuid}.enc를 DEK로 풀어 페이로드를 돌려준다 */
async function readRemotePayload(cloud: FakeCloud, dek: string) {
  const name = [...cloud.files.keys()].find((n) => n.endsWith('.enc'))!
  const parsed: unknown = JSON.parse(cloud.files.get(name)!)
  expect(isEncryptedNoteFile(parsed)).toBe(true)
  const file = parsed as { ciphertext: string }
  const plain = await decrypt(file.ciphertext, await importDEK(dek))
  return JSON.parse(plain) as { tags: string[]; folderPath: string[]; title: string }
}

describe('동기화 페이로드는 at-rest 암호문을 그대로 싣지 않는다', () => {
  beforeEach(reset)

  it('push된 페이로드의 태그가 평문이다 — 암호문이면 DEK로 이중 암호화되어 상대 기기가 못 읽는다', async () => {
    const folderId = (await db.folders.add({
      parentId: null, name: await encryptFolderName('사내 인프라', atRestKey), order: 0, createdAt: 100,
    } as Omit<Folder, 'id'>)) as number
    await db.items.add({
      folderId, title: '운영 DB', type: 'db',
      tags: await encryptTags(['prod', 'db'], atRestKey),
      order: 0, pinned: false, content: '{"format":"legacy","text":"x"}',
      updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)

    const cloud = new FakeCloud()
    const dek = generateDEK()
    await runSync(cloud, dek, 'deviceA', 1000, atRestKey)

    const payload = await readRemotePayload(cloud, dek)
    expect(payload.tags).toEqual(['prod', 'db'])
    expect(payload.tags.some((t) => isEncryptedContent(t))).toBe(false)
  })

  it('push된 페이로드의 folderPath가 평문이다', async () => {
    const folderId = (await db.folders.add({
      parentId: null, name: await encryptFolderName('사내 인프라', atRestKey), order: 0, createdAt: 100,
    } as Omit<Folder, 'id'>)) as number
    await db.items.add({
      folderId, title: 'x', type: 'note', tags: [], order: 0, pinned: false,
      content: '{"format":"legacy","text":"x"}', updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)

    const cloud = new FakeCloud()
    const dek = generateDEK()
    await runSync(cloud, dek, 'deviceA', 1000, atRestKey)

    const payload = await readRemotePayload(cloud, dek)
    expect(payload.folderPath).toEqual(['사내 인프라'])
    expect(payload.folderPath.some((n) => isEncryptedContent(n))).toBe(false)
  })

  it('pull 시 태그·폴더명이 로컬 at-rest 키로 다시 암호화되어 저장된다', async () => {
    // 기기 A: 평문 상태로 push
    await db.folders.add({ parentId: null, name: '공용폴더', order: 0, createdAt: 100 } as Omit<Folder, 'id'>)
    const folders = await db.folders.toArray()
    await db.items.add({
      folderId: folders[0].id, title: 'shared', type: 'note', tags: ['alpha'],
      order: 0, pinned: false, content: '{"format":"legacy","text":"x"}',
      updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)
    const cloud = new FakeCloud()
    const dek = generateDEK()
    await runSync(cloud, dek, 'deviceA', 1000, null)

    // 기기 B: at-rest 암호화를 쓰는 기기가 pull
    await reset()
    await runSync(cloud, dek, 'deviceB', 2000, atRestKey)

    const item = (await db.items.toArray())[0]
    const folder = (await db.folders.toArray())[0]
    expect(item.tags.every((t) => isEncryptedContent(t))).toBe(true)
    expect(isEncryptedContent(folder.name)).toBe(true)
  })

  it('암호화된 폴더명이어도 반복 동기화가 폴더를 중복 생성하지 않는다 (ensureFolderPath 이름 비교)', async () => {
    await db.folders.add({
      parentId: null, name: await encryptFolderName('사내 인프라', atRestKey), order: 0, createdAt: 100,
    } as Omit<Folder, 'id'>)
    const folders = await db.folders.toArray()
    await db.items.add({
      folderId: folders[0].id, title: 'x', type: 'note',
      tags: [], order: 0, pinned: false, content: '{"format":"legacy","text":"x"}',
      updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)

    const cloud = new FakeCloud()
    const dek = generateDEK()
    await runSync(cloud, dek, 'deviceA', 1000, atRestKey)

    // 원격을 다시 당겨오는 기기 — 같은 폴더명이 이미 로컬에 암호문으로 있다
    await db.syncState.clear()
    await runSync(cloud, dek, 'deviceA', 2000, atRestKey)
    await runSync(cloud, dek, 'deviceA', 3000, atRestKey)

    expect(await db.folders.count()).toBe(1)
  })
})
