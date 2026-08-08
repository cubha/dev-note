import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../core/db'
import { backfillMeta, decryptAllMeta, reencryptMeta } from '../core/metaStore'
import { decryptTags, decryptFolderName, encryptTags, encryptFolderName } from '../core/metaCrypto'
import { isEncryptedContent } from '../core/content'
import { deriveKey, generateSalt } from '../core/crypto'
import type { Item, Folder } from '../core/db'

let key: CryptoKey
let newKey: CryptoKey
let wrongKey: CryptoKey
let otherKey: CryptoKey

beforeAll(async () => {
  key = await deriveKey('passphrase', generateSalt())
  newKey = await deriveKey('new-passphrase', generateSalt())
  wrongKey = await deriveKey('WRONG-passphrase', generateSalt())
  otherKey = await deriveKey('other-passphrase', generateSalt())
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

  it('틀린 키로 호출하면 예외를 던지고 암호문 원본을 그대로 보존한다(데이터 파괴 방지)', async () => {
    const { itemId, folderId } = await seed()
    await backfillMeta(key)
    const beforeTags = (await db.items.get(itemId))?.tags
    const beforeName = (await db.folders.get(folderId))?.name

    await expect(decryptAllMeta(wrongKey)).rejects.toThrow()

    expect((await db.items.get(itemId))?.tags).toEqual(beforeTags)
    expect((await db.folders.get(folderId))?.name).toEqual(beforeName)
    expect(await decryptTags((await db.items.get(itemId))?.tags ?? [], key)).toEqual(['prod', 'db'])
    expect(await decryptFolderName((await db.folders.get(folderId))?.name ?? '', key)).toBe('사내 인프라')
  })

  it('아이템은 복호화되고 폴더만 실패해도, 이미 성공한 아이템 쓰기가 먼저 반영되지 않는다(전부-아니면-전무)', async () => {
    // 아이템 태그는 key로, 폴더명은 다른 키(otherKey)로 암호화 — key로 decryptAllMeta를
    // 돌리면 아이템은 복호화에 성공하지만 폴더에서 실패한다. 순차 루프였다면 아이템이
    // 먼저 평문으로 쓰이고 나서 폴더에서 예외가 나 "부분 평문화" 상태가 남는다.
    const { itemId, folderId } = await seed()
    await db.items.update(itemId, { tags: await encryptTags(['prod', 'db'], key) })
    await db.folders.update(folderId, { name: await encryptFolderName('사내 인프라', otherKey) })

    await expect(decryptAllMeta(key)).rejects.toThrow()

    // 아이템 태그도 손대지 않았어야 한다 — 부분 쓰기 없음
    expect((await db.items.get(itemId))?.tags.every((t) => isEncryptedContent(t))).toBe(true)
    expect(await decryptTags((await db.items.get(itemId))?.tags ?? [], key)).toEqual(['prod', 'db'])
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

  it('틀린 oldKey로 호출하면 예외를 던지고 폴더명·태그 원본을 그대로 보존한다(데이터 파괴 방지)', async () => {
    const { itemId, folderId } = await seed()
    await backfillMeta(key)
    const beforeTags = (await db.items.get(itemId))?.tags
    const beforeName = (await db.folders.get(folderId))?.name

    await expect(reencryptMeta(wrongKey, newKey)).rejects.toThrow()

    expect((await db.items.get(itemId))?.tags).toEqual(beforeTags)
    expect((await db.folders.get(folderId))?.name).toEqual(beforeName)
    // 원본이 파괴되지 않았으므로 정상 키로는 여전히 복호화된다
    expect(await decryptTags((await db.items.get(itemId))?.tags ?? [], key)).toEqual(['prod', 'db'])
    expect(await decryptFolderName((await db.folders.get(folderId))?.name ?? '', key)).toBe('사내 인프라')
  })

  it('아이템은 복호화되고 폴더만 실패해도, 이미 성공한 아이템 재암호화가 먼저 반영되지 않는다(전부-아니면-전무)', async () => {
    // 아이템 태그는 key로, 폴더명은 otherKey로 암호화 — oldKey=key로 reencryptMeta를
    // 돌리면 아이템은 복호화 성공하지만 폴더에서 실패한다. 순차 루프였다면 아이템이
    // 먼저 newKey로 재암호화되고 폴더는 여전히 key인 "키가 갈라진" 상태가 남는다.
    const { itemId, folderId } = await seed()
    await db.items.update(itemId, { tags: await encryptTags(['prod', 'db'], key) })
    await db.folders.update(folderId, { name: await encryptFolderName('사내 인프라', otherKey) })

    await expect(reencryptMeta(key, newKey)).rejects.toThrow()

    // 아이템 태그가 newKey로 넘어가지 않았어야 한다 — 여전히 key로만 복호화된다
    expect(await decryptTags((await db.items.get(itemId))?.tags ?? [], key)).toEqual(['prod', 'db'])
    expect(await decryptTags((await db.items.get(itemId))?.tags ?? [], newKey)).toEqual([])
  })
})
