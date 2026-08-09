// backfillMeta / enableEncryptionAtomic 원자성.
//
// backfillMeta만 형제 함수(decryptAllMeta·reencryptMeta)와 달리 compute-then-write가 아니라
// 항목별 즉시 db.items.update를 돌렸다. enableEncryptionAtomic은 이 백필을 salt·canary를
// 기록하는 트랜잭션 **밖에서 먼저** 실행하므로, 백필 도중 실패하면 태그·폴더명 일부만
// key로 암호화된 채 salt가 영속되지 않아 그 키를 다시 파생할 수 없는 복구 불능 상태가
// 남는다(security-auditor 지적). 다른 두 lifecycle 함수와 달리 재시도로도 못 살린다 —
// 그쪽은 salt가 이미 있지만 최초 활성화는 salt 자체가 없기 때문이다.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// 폴더명 암호화만 실패시켜 "아이템은 처리됐고 폴더에서 터지는" 중간 실패를 만든다.
vi.mock('../core/metaCrypto', async () => {
  const actual = await vi.importActual<typeof import('../core/metaCrypto')>('../core/metaCrypto')
  return {
    ...actual,
    encryptFolderName: async (name: string, key: CryptoKey) => {
      if (name === '터지는폴더') throw new Error('injected failure')
      return actual.encryptFolderName(name, key)
    },
  }
})

import { db, ensureConfig } from '../core/db'
import { backfillMeta } from '../core/metaStore'
import { enableEncryptionAtomic } from '../features/settings/encryptionLifecycle'
import { deriveKey, generateSalt, makeCanary } from '../core/crypto'
import { isEncryptedContent } from '../core/content'
import type { Item, Folder } from '../core/db'

async function seed() {
  await db.items.add({
    folderId: null, title: '카드', type: 'note', tags: ['prod'],
    content: '{"format":"legacy","text":"평문 내용"}',
    order: 0, pinned: false, updatedAt: 1, createdAt: 1,
  } as Omit<Item, 'id'>)
  await db.folders.add({ parentId: null, name: '터지는폴더', order: 0, createdAt: 1 } as Omit<Folder, 'id'>)
}

describe('백필 원자성 — 중간 실패 시 아무것도 암호화되지 않는다', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
    await db.config.clear()
    await ensureConfig()
  })

  it('backfillMeta: 폴더에서 실패하면 앞서 처리한 아이템 태그도 평문 그대로 남는다', async () => {
    const key = await deriveKey('p', generateSalt())
    await seed()

    await expect(backfillMeta(key)).rejects.toThrow()

    const item = (await db.items.toArray())[0]
    expect(item.tags).toEqual(['prod']) // 암호화되지 않았어야 한다
  })

  it('enableEncryptionAtomic: 백필이 실패하면 salt·canary 없이 데이터만 암호화된 복구불능 상태가 생기지 않는다', async () => {
    const key = await deriveKey('p', generateSalt())
    await seed()

    await expect(
      enableEncryptionAtomic(key, 'salt-hex', await makeCanary(key)),
    ).rejects.toThrow()

    const item = (await db.items.toArray())[0]
    const config = await db.config.get(1)
    // 태그·content 어느 쪽도 넘어가지 않았고, config도 그대로다 — 재시도로 온전히 복구 가능
    expect(item.tags).toEqual(['prod'])
    expect(isEncryptedContent(item.content)).toBe(false)
    expect(config?.encryptionEnabled).toBe(false)
    expect(config?.encryptionSalt).toBeNull()
    expect(config?.encryptionCheck).toBeNull()
  })

  it('정상 케이스는 태그·폴더명·content·config가 모두 함께 기록된다', async () => {
    const key = await deriveKey('p', generateSalt())
    await db.items.add({
      folderId: null, title: '카드', type: 'note', tags: ['prod'],
      content: '{"format":"legacy","text":"평문 내용"}',
      order: 0, pinned: false, updatedAt: 1, createdAt: 1,
    } as Omit<Item, 'id'>)
    await db.folders.add({ parentId: null, name: '정상폴더', order: 0, createdAt: 1 } as Omit<Folder, 'id'>)
    const canary = await makeCanary(key)

    await enableEncryptionAtomic(key, 'salt-hex', canary)

    const item = (await db.items.toArray())[0]
    const folder = (await db.folders.toArray())[0]
    const config = await db.config.get(1)
    expect(item.tags.every((t) => isEncryptedContent(t))).toBe(true)
    expect(isEncryptedContent(item.content)).toBe(true)
    expect(isEncryptedContent(folder.name)).toBe(true)
    expect(config?.encryptionSalt).toBe('salt-hex')
    expect(config?.encryptionCheck).toBe(canary)
  })
})
