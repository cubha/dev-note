// SecurityTab의 패스프레이즈 변경·암호화 비활성화 orchestration.
//
// 예전 순서(content 즉시 쓰기 → reencryptMeta/decryptAllMeta)는 메타 재암호화가
// 실패(예: 태그·폴더명이 서로 다른 키로 섞인 상태)하면 이미 newKey/평문으로 쓰인
// content가 새 salt/config 갱신 없이 남아 영구 복구 불능이 됐다(advisor 지적).
// 메타를 먼저 원자적으로 끝내고, content+config를 한 트랜잭션으로 묶어 이 순서
// 의존성을 구조적으로 없앤다.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db, ensureConfig } from '../core/db'
import { enableEncryptionAtomic, changePassphraseAtomic, disableEncryptionAtomic } from '../features/settings/encryptionLifecycle'
import { encryptContent, decryptContent, isEncryptedContent } from '../core/content'
import { encryptTags, encryptFolderName, decryptTags } from '../core/metaCrypto'
import { deriveKey, generateSalt, makeCanary } from '../core/crypto'
import type { Item, Folder } from '../core/db'

let oldKey: CryptoKey
let newKey: CryptoKey
let otherKey: CryptoKey

beforeAll(async () => {
  oldKey = await deriveKey('old-passphrase', generateSalt())
  newKey = await deriveKey('new-passphrase', generateSalt())
  otherKey = await deriveKey('other-passphrase', generateSalt())
})

async function seedMixedKeyMeta(): Promise<{ itemId: number; folderId: number }> {
  // 태그는 oldKey로(정상), 폴더명은 otherKey로(비정상) — oldKey로 reencryptMeta를
  // 돌리면 폴더에서 반드시 실패하는 상태를 인위적으로 만든다.
  const folderId = (await db.folders.add({
    parentId: null, name: await encryptFolderName('사내 인프라', otherKey), order: 0, createdAt: 100,
  } as Omit<Folder, 'id'>)) as number
  const itemId = (await db.items.add({
    folderId, title: '운영 DB', type: 'db',
    tags: await encryptTags(['prod', 'db'], oldKey),
    content: await encryptContent('{"format":"legacy","text":"민감정보"}', oldKey),
    order: 0, pinned: false, updatedAt: 100, createdAt: 100,
  } as Omit<Item, 'id'>)) as number
  return { itemId, folderId }
}

describe('enableEncryptionAtomic', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
    await db.config.clear()
    await ensureConfig()
  })

  it('content·태그·폴더명·config가 모두 일관되게 암호화/기록된다', async () => {
    const folderId = (await db.folders.add({
      parentId: null, name: '사내 인프라', order: 0, createdAt: 100,
    } as Omit<Folder, 'id'>)) as number
    const itemId = (await db.items.add({
      folderId, title: '운영 DB', type: 'db', tags: ['prod'],
      content: '{"format":"legacy","text":"x"}',
      order: 0, pinned: false, updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)) as number
    const canary = await makeCanary(oldKey)

    await enableEncryptionAtomic(oldKey, 'salt-hex', canary)

    const item = await db.items.get(itemId)
    const folder = await db.folders.get(folderId)
    expect(isEncryptedContent(item?.content ?? '')).toBe(true)
    expect(await decryptContent(item?.content ?? '', oldKey)).toBe('{"format":"legacy","text":"x"}')
    expect(await decryptTags(item?.tags ?? [], oldKey)).toEqual(['prod'])
    expect(isEncryptedContent(folder?.name ?? '')).toBe(true)
    const config = await db.config.get(1)
    expect(config?.encryptionEnabled).toBe(true)
    expect(config?.encryptionSalt).toBe('salt-hex')
    expect(config?.encryptionCheck).toBe(canary)
  })

  it('이미 암호화된 content는 다시 암호화하지 않는다(멱등)', async () => {
    const encrypted = await encryptContent('{"format":"legacy","text":"x"}', oldKey)
    const itemId = (await db.items.add({
      folderId: null, title: 't', type: 'note', tags: [],
      content: encrypted,
      order: 0, pinned: false, updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)) as number

    await enableEncryptionAtomic(oldKey, 'salt-hex', await makeCanary(oldKey))

    expect((await db.items.get(itemId))?.content).toBe(encrypted)
  })
})

describe('changePassphraseAtomic', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
    await db.config.clear()
    await ensureConfig()
  })

  it('메타 재암호화가 실패하면 content도 새 키로 넘어가지 않는다(전부-아니면-전무)', async () => {
    const { itemId } = await seedMixedKeyMeta()
    const beforeContent = (await db.items.get(itemId))?.content

    await expect(
      changePassphraseAtomic(oldKey, newKey, 'new-salt-hex', await makeCanary(newKey)),
    ).rejects.toThrow()

    // content가 그대로 남아 oldKey로 계속 복호화된다 — newKey로 넘어가지 않았다
    expect((await db.items.get(itemId))?.content).toEqual(beforeContent)
    expect(await decryptContent((await db.items.get(itemId))?.content ?? '', oldKey))
      .toBe('{"format":"legacy","text":"민감정보"}')
  })

  it('메타 재암호화가 실패하면 config(salt)도 갱신되지 않는다', async () => {
    await seedMixedKeyMeta()
    await db.config.update(1, { encryptionEnabled: true, encryptionSalt: 'old-salt-hex' })

    await expect(
      changePassphraseAtomic(oldKey, newKey, 'new-salt-hex', await makeCanary(newKey)),
    ).rejects.toThrow()

    expect((await db.config.get(1))?.encryptionSalt).toBe('old-salt-hex')
  })

  it('정상 케이스는 content·메타·config가 모두 새 키로 일관되게 바뀐다', async () => {
    const folderId = (await db.folders.add({
      parentId: null, name: await encryptFolderName('사내 인프라', oldKey), order: 0, createdAt: 100,
    } as Omit<Folder, 'id'>)) as number
    const itemId = (await db.items.add({
      folderId, title: '운영 DB', type: 'db',
      tags: await encryptTags(['prod'], oldKey),
      content: await encryptContent('{"format":"legacy","text":"x"}', oldKey),
      order: 0, pinned: false, updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)) as number
    const newCanary = await makeCanary(newKey)

    await changePassphraseAtomic(oldKey, newKey, 'new-salt-hex', newCanary)

    const item = await db.items.get(itemId)
    expect(await decryptContent(item?.content ?? '', newKey)).toBe('{"format":"legacy","text":"x"}')
    expect(await decryptTags(item?.tags ?? [], newKey)).toEqual(['prod'])
    const config = await db.config.get(1)
    expect(config?.encryptionSalt).toBe('new-salt-hex')
    expect(config?.encryptionCheck).toBe(newCanary)
  })
})

describe('disableEncryptionAtomic', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
    await db.config.clear()
    await ensureConfig()
  })

  it('메타 복호화가 실패하면 content도 평문으로 넘어가지 않는다(전부-아니면-전무)', async () => {
    // 태그는 key로, 폴더명은 otherKey로 — key로 decryptAllMeta를 돌리면 폴더에서 실패
    const folderId = (await db.folders.add({
      parentId: null, name: await encryptFolderName('사내 인프라', otherKey), order: 0, createdAt: 100,
    } as Omit<Folder, 'id'>)) as number
    const itemId = (await db.items.add({
      folderId, title: '운영 DB', type: 'db',
      tags: await encryptTags(['prod'], oldKey),
      content: await encryptContent('{"format":"legacy","text":"민감정보"}', oldKey),
      order: 0, pinned: false, updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)) as number
    await db.config.update(1, { encryptionEnabled: true, encryptionSalt: 'salt-hex' })

    await expect(disableEncryptionAtomic(oldKey)).rejects.toThrow()

    // content가 평문으로 새지 않았다 — 여전히 암호문
    const content = (await db.items.get(itemId))?.content
    expect(isEncryptedContent(content ?? '')).toBe(true)
    expect((await db.config.get(1))?.encryptionEnabled).toBe(true)
  })

  it('정상 케이스는 content·메타·config가 모두 평문/비활성으로 바뀐다', async () => {
    const folderId = (await db.folders.add({
      parentId: null, name: await encryptFolderName('사내 인프라', oldKey), order: 0, createdAt: 100,
    } as Omit<Folder, 'id'>)) as number
    const itemId = (await db.items.add({
      folderId, title: '운영 DB', type: 'db',
      tags: await encryptTags(['prod'], oldKey),
      content: await encryptContent('{"format":"legacy","text":"x"}', oldKey),
      order: 0, pinned: false, updatedAt: 100, createdAt: 100,
    } as Omit<Item, 'id'>)) as number
    await db.config.update(1, { encryptionEnabled: true, encryptionSalt: 'salt-hex', encryptionCheck: 'c' })

    await disableEncryptionAtomic(oldKey)

    expect((await db.items.get(itemId))?.content).toBe('{"format":"legacy","text":"x"}')
    const config = await db.config.get(1)
    expect(config?.encryptionEnabled).toBe(false)
    expect(config?.encryptionSalt).toBeNull()
    expect(config?.encryptionCheck).toBeNull()
  })
})
