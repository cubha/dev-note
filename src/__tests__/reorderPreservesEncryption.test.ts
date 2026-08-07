// 재정렬이 암호화된 메타데이터를 평문으로 덮어쓰지 않는지 —
// 목록 컴포넌트는 표시용으로 tags/name을 복호화한 "사본"을 들고 있다. 그 사본을
// 전체 행 그대로 bulkPut하면 화면에 보이던 모든 카드/폴더의 메타데이터가 평문이 된다.
// 재정렬은 order(및 이동 시 parentId/folderId)만 써야 한다.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../core/db'
import { reorderItems, reorderFolders, moveItemsToFolder } from '../features/sidebar/treeUtils'
import { encryptTags, encryptFolderName, decryptTags, decryptFolderName } from '../core/metaCrypto'
import { isEncryptedContent } from '../core/content'
import { deriveKey, generateSalt } from '../core/crypto'
import type { Item, Folder } from '../core/db'

let key: CryptoKey
beforeAll(async () => { key = await deriveKey('passphrase', generateSalt()) })

const CONTENT = '{"format":"structured","fields":[]}'

async function seedItems(count: number, folderId: number | null = null): Promise<Item[]> {
  for (let i = 0; i < count; i++) {
    await db.items.add({
      folderId, title: `카드${i}`, type: 'note',
      tags: await encryptTags([`tag${i}`], key),
      order: i, pinned: false, content: CONTENT, updatedAt: 1, createdAt: 1,
    } as Omit<Item, 'id'>)
  }
  return db.items.orderBy('order').toArray()
}

/** 목록 컴포넌트가 넘기는 것과 같은, 복호화된 표시용 사본 */
async function asDisplayed(items: Item[]): Promise<Item[]> {
  return Promise.all(items.map(async (i) => ({ ...i, tags: await decryptTags(i.tags, key) })))
}

describe('재정렬은 암호화된 태그를 평문으로 덮어쓰지 않는다', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
  })

  it('카드 재정렬 후에도 모든 태그가 암호문으로 남는다', async () => {
    const rows = await seedItems(3)
    await reorderItems(await asDisplayed(rows), rows[0].id, rows[2].id, [])

    const after = await db.items.toArray()
    for (const item of after) {
      expect(item.tags.every((t) => isEncryptedContent(t))).toBe(true)
    }
    expect(JSON.stringify(after.map((i) => i.tags))).not.toContain('tag0')
  })

  it('재정렬이 order는 실제로 바꾼다(무해화가 아니라 동작 보존)', async () => {
    const rows = await seedItems(3)
    const before = rows.map((r) => r.id)
    await reorderItems(await asDisplayed(rows), rows[0].id, rows[2].id, [])

    const after = await db.items.orderBy('order').toArray()
    expect(after.map((r) => r.id)).not.toEqual(before)
    expect(new Set(after.map((r) => r.id))).toEqual(new Set(before))
  })

  it('폴더 간 이동 후에도 태그가 암호문으로 남는다', async () => {
    const folderId = (await db.folders.add({
      parentId: null, name: await encryptFolderName('대상폴더', key), order: 0, createdAt: 1,
    } as Omit<Folder, 'id'>)) as number
    const rows = await seedItems(2)
    await moveItemsToFolder(await asDisplayed(rows), [rows[0].id], folderId)

    const moved = await db.items.get(rows[0].id)
    expect(moved?.folderId).toBe(folderId)
    expect(moved?.tags.every((t) => isEncryptedContent(t))).toBe(true)
  })
})

describe('폴더 재정렬은 암호화된 폴더명을 평문으로 덮어쓰지 않는다', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
  })

  async function seedFolders(names: string[]): Promise<Folder[]> {
    for (let i = 0; i < names.length; i++) {
      await db.folders.add({
        parentId: null, name: await encryptFolderName(names[i], key), order: i + 1, createdAt: 1,
      } as Omit<Folder, 'id'>)
    }
    return db.folders.orderBy('order').toArray()
  }

  /** 사이드바가 useDecryptedFolders로 받는 것과 같은 복호화 사본 */
  async function asDisplayedFolders(folders: Folder[]): Promise<Folder[]> {
    return Promise.all(folders.map(async (f) => ({ ...f, name: await decryptFolderName(f.name, key) })))
  }

  it('폴더 재정렬 후에도 모든 폴더명이 암호문으로 남는다', async () => {
    const rows = await seedFolders(['사내 인프라', '개인', '보관'])
    await reorderFolders(await asDisplayedFolders(rows), rows[0].id, rows[2].id)

    const after = await db.folders.toArray()
    for (const f of after) {
      expect(isEncryptedContent(f.name)).toBe(true)
    }
    expect(after.map((f) => f.name).join('')).not.toContain('사내')
  })

  it('폴더 재정렬이 order는 실제로 바꾼다', async () => {
    const rows = await seedFolders(['a', 'b', 'c'])
    const before = rows.map((r) => r.id)
    await reorderFolders(await asDisplayedFolders(rows), rows[0].id, rows[2].id)

    const after = await db.folders.orderBy('order').toArray()
    expect(after.map((r) => r.id)).not.toEqual(before)
  })

  it('부모가 다른 폴더로 이동해도 폴더명이 암호문으로 남는다', async () => {
    const parentId = (await db.folders.add({
      parentId: null, name: await encryptFolderName('부모', key), order: 1, createdAt: 1,
    } as Omit<Folder, 'id'>)) as number
    await db.folders.add({
      parentId, name: await encryptFolderName('자식', key), order: 2, createdAt: 1,
    } as Omit<Folder, 'id'>)
    await db.folders.add({
      parentId: null, name: await encryptFolderName('이동대상', key), order: 3, createdAt: 1,
    } as Omit<Folder, 'id'>)

    const rows = await db.folders.orderBy('order').toArray()
    const child = rows.find((f) => f.parentId === parentId)!
    const target = rows[rows.length - 1]
    await reorderFolders(await asDisplayedFolders(rows), child.id, target.id)

    for (const f of await db.folders.toArray()) {
      expect(isEncryptedContent(f.name)).toBe(true)
    }
  })
})
