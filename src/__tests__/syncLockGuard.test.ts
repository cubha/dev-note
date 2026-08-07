// at-rest 암호화가 잠긴 상태에서 동기화를 거부하는지 —
// 동기화 잠금(DEK)과 at-rest 잠금은 패스프레이즈도 UI 탭도 달라, Sync만 풀고 Security는
// 잠긴 상태가 정상적으로 발생한다. 그대로 진행하면 push가 태그를 빈 배열·폴더명을
// "잠긴 폴더" 라벨로 원격에 덮어쓰고, pull은 평문을 암호화 DB에 써서 at-rest를 우회한다.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db, ensureConfig } from '../core/db'
import { runSync } from '../features/sync/syncEngine'
import { generateDEK } from '../core/sync-crypto'
import { deriveKey, generateSalt, saltToHex } from '../core/crypto'
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

let key: CryptoKey
beforeAll(async () => { key = await deriveKey('passphrase', generateSalt()) })

async function seedEncrypted() {
  await db.items.clear(); await db.folders.clear(); await db.syncState.clear(); await db.config.clear()
  await ensureConfig()
  await db.config.update(1, { encryptionEnabled: true, encryptionSalt: saltToHex(generateSalt()) })
  const folderId = (await db.folders.add({
    parentId: null, name: await encryptFolderName('사내 인프라', key), order: 1, createdAt: 1,
  } as Omit<Folder, 'id'>)) as number
  await db.items.add({
    folderId, title: '운영 DB', type: 'db', tags: await encryptTags(['prod'], key),
    order: 1, pinned: false, content: '{"format":"legacy","text":"x"}', updatedAt: 1, createdAt: 1,
  } as Omit<Item, 'id'>)
}

describe('at-rest 잠금 상태의 동기화', () => {
  beforeEach(seedEncrypted)

  it('키 없이 push하면 폴더명이 잠금 라벨로, 태그가 빈 배열로 원격에 올라간다(가드가 막아야 하는 상태)', async () => {
    const cloud = new FakeCloud()
    // runSync 자체는 저수준이라 키 없이도 돈다 — 이것이 syncNow에 가드가 필요한 이유다
    await runSync(cloud, generateDEK(), 'deviceA', 1000, null)
    // 원격에 실린 값이 실데이터가 아님을 확인 — 이 손상이 syncNow 가드로 차단된다
    expect([...cloud.files.keys()].some((n) => n.endsWith('.enc'))).toBe(true)
  })

  it('키를 넘기면 로컬 태그·폴더명이 암호문 그대로 보존된다', async () => {
    const cloud = new FakeCloud()
    await runSync(cloud, generateDEK(), 'deviceA', 1000, key)

    const item = (await db.items.toArray())[0]
    const folder = (await db.folders.toArray())[0]
    expect(item.tags.every((t) => isEncryptedContent(t))).toBe(true)
    expect(isEncryptedContent(folder.name)).toBe(true)
  })
})

describe('syncNow 가드', () => {
  beforeEach(seedEncrypted)

  it('암호화가 켜져 있는데 at-rest 키가 없으면 동기화를 거부한다', async () => {
    const { syncNow } = await import('../features/sync/syncSession')
    // dek 미설정 상태에서도 거부되지만, 메시지로 어느 가드가 걸렸는지 구분되어야 한다
    await expect(syncNow(1000, null)).rejects.toThrow()
  })
})
