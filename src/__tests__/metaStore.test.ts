import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../core/db'
import { backfillMeta, decryptAllMeta, reencryptMeta } from '../core/metaStore'
import { decryptTags, decryptFolderName } from '../core/metaCrypto'
import { isEncryptedContent } from '../core/content'
import { deriveKey, generateSalt } from '../core/crypto'
import type { Item, Folder } from '../core/db'

let key: CryptoKey
let newKey: CryptoKey

beforeAll(async () => {
  key = await deriveKey('passphrase', generateSalt())
  newKey = await deriveKey('new-passphrase', generateSalt())
})

const PLAIN_CONTENT = '{"format":"structured","fields":[]}'

async function seed(): Promise<{ itemId: number; folderId: number }> {
  const folderId = (await db.folders.add({
    parentId: null, name: '사내 인프라', order: 0, createdAt: 100,
  } as Omit<Folder, 'id'>)) as number
  const itemId = (await db.items.add({
    folderId, title: '운영 DB', type: 'db', tags: ['prod', 'db'],
    order: 0, pinned: false, content: PLAIN_CONTENT, updatedAt: 100, createdAt: 100,
  } as Omit<Item, 'id'>)) as number
  return { itemId, folderId }
}

describe('backfillMeta', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
  })

  it('평문 태그와 폴더명을 암호화한다', async () => {
    const { itemId, folderId } = await seed()
    await backfillMeta(key)

    const item = await db.items.get(itemId)
    const folder = await db.folders.get(folderId)
    expect(item?.tags.every((t) => isEncryptedContent(t))).toBe(true)
    expect(isEncryptedContent(folder?.name ?? '')).toBe(true)
    expect(await decryptTags(item?.tags ?? [], key)).toEqual(['prod', 'db'])
    expect(await decryptFolderName(folder?.name ?? '', key)).toBe('사내 인프라')
  })

  it('카드 제목은 건드리지 않는다(평문 유지가 확정 설계)', async () => {
    const { itemId } = await seed()
    await backfillMeta(key)
    expect((await db.items.get(itemId))?.title).toBe('운영 DB')
  })

  it('content는 건드리지 않는다(별도 경로가 담당)', async () => {
    const { itemId } = await seed()
    await backfillMeta(key)
    expect((await db.items.get(itemId))?.content).toBe(PLAIN_CONTENT)
  })

  it('두 번 돌려도 값이 바뀌지 않는다(멱등 — 재암호화 금지)', async () => {
    const { itemId, folderId } = await seed()
    await backfillMeta(key)
    const afterFirst = {
      tags: (await db.items.get(itemId))?.tags,
      name: (await db.folders.get(folderId))?.name,
    }
    await backfillMeta(key)
    expect((await db.items.get(itemId))?.tags).toEqual(afterFirst.tags)
    expect((await db.folders.get(folderId))?.name).toBe(afterFirst.name)
  })

  it('빈 DB에서도 예외 없이 통과한다', async () => {
    await expect(backfillMeta(key)).resolves.not.toThrow()
  })

  it('태그가 없는 카드도 안전하게 통과한다', async () => {
    const id = (await db.items.add({
      folderId: null, title: 'x', type: 'note', tags: [],
      order: 0, pinned: false, content: PLAIN_CONTENT, updatedAt: 1, createdAt: 1,
    } as Omit<Item, 'id'>)) as number
    await backfillMeta(key)
    expect((await db.items.get(id))?.tags).toEqual([])
  })
})

describe('decryptAllMeta', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
  })

  it('암호화된 태그·폴더명을 평문으로 되돌린다', async () => {
    const { itemId, folderId } = await seed()
    await backfillMeta(key)
    await decryptAllMeta(key)

    expect((await db.items.get(itemId))?.tags).toEqual(['prod', 'db'])
    expect((await db.folders.get(folderId))?.name).toBe('사내 인프라')
  })

  it('이미 평문이면 그대로 둔다(멱등)', async () => {
    const { itemId, folderId } = await seed()
    await decryptAllMeta(key)
    expect((await db.items.get(itemId))?.tags).toEqual(['prod', 'db'])
    expect((await db.folders.get(folderId))?.name).toBe('사내 인프라')
  })
})

describe('reencryptMeta', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
  })

  it('옛 키 암호문을 새 키 암호문으로 바꾸고 원본 값이 보존된다', async () => {
    const { itemId, folderId } = await seed()
    await backfillMeta(key)
    await reencryptMeta(key, newKey)

    const item = await db.items.get(itemId)
    const folder = await db.folders.get(folderId)
    expect(await decryptTags(item?.tags ?? [], newKey)).toEqual(['prod', 'db'])
    expect(await decryptFolderName(folder?.name ?? '', newKey)).toBe('사내 인프라')
  })

  it('키 교체 후 옛 키로는 더 이상 복호화되지 않는다', async () => {
    const { itemId } = await seed()
    await backfillMeta(key)
    await reencryptMeta(key, newKey)
    // 옛 키로는 복호화 실패 → decryptTags가 조용히 제외하므로 빈 배열
    expect(await decryptTags((await db.items.get(itemId))?.tags ?? [], key)).toEqual([])
  })

  it('평문으로 남아 있던 값도 새 키로 암호화한다(백필 누락분 흡수)', async () => {
    const { itemId, folderId } = await seed()
    await reencryptMeta(key, newKey)

    const item = await db.items.get(itemId)
    const folder = await db.folders.get(folderId)
    expect(item?.tags.every((t) => isEncryptedContent(t))).toBe(true)
    expect(await decryptTags(item?.tags ?? [], newKey)).toEqual(['prod', 'db'])
    expect(await decryptFolderName(folder?.name ?? '', newKey)).toBe('사내 인프라')
  })
})
