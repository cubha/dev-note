// 가져오기가 이 기기의 at-rest 암호화 상태를 존중하는지 —
// 백업 파일은 어느 기기에서 만들어졌는지 모른다. 평문 백업을 암호화된 기기로 가져오면
// 태그·폴더명이 평문으로 박히고, 다음 backfill 전까지 그대로 남는다.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db } from '../core/db'
import { importData } from '../features/storage/import'
import { encryptTags, encryptFolderName, decryptTags, decryptFolderName } from '../core/metaCrypto'
import { isEncryptedContent } from '../core/content'
import { deriveKey, generateSalt } from '../core/crypto'

let key: CryptoKey
beforeAll(async () => { key = await deriveKey('passphrase', generateSalt()) })

const CONTENT = '{"format":"structured","fields":[]}'

function backup(folders: Array<{ id: number; name: string }>, tags: string[]) {
  return JSON.stringify({
    version: 2,
    exportedAt: 1,
    folders: folders.map((f) => ({ ...f, parentId: null, order: 1, createdAt: 1 })),
    items: [{
      folderId: folders[0]?.id ?? null, title: '카드', type: 'note', tags,
      order: 1, pinned: false, content: CONTENT, updatedAt: 1, createdAt: 1,
    }],
  })
}

describe('importData × at-rest 암호화', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
  })

  it('평문 백업을 암호화된 기기로 가져오면 태그·폴더명을 암호화해 저장한다', async () => {
    await importData(backup([{ id: 1, name: '사내 인프라' }], ['prod', 'db']), 'append', key)

    const item = (await db.items.toArray())[0]
    const folder = (await db.folders.toArray())[0]
    expect(item.tags.every((t) => isEncryptedContent(t))).toBe(true)
    expect(isEncryptedContent(folder.name)).toBe(true)
    expect(await decryptTags(item.tags, key)).toEqual(['prod', 'db'])
    expect(await decryptFolderName(folder.name, key)).toBe('사내 인프라')
  })

  it('암호화된 백업을 같은 키로 가져오면 이중 암호화하지 않는다(멱등)', async () => {
    const encTags = await encryptTags(['prod'], key)
    const encName = await encryptFolderName('사내 인프라', key)
    await importData(backup([{ id: 1, name: encName }], encTags), 'append', key)

    const item = (await db.items.toArray())[0]
    const folder = (await db.folders.toArray())[0]
    // 한 겹만 벗기면 원문이 나와야 한다 — 두 겹이면 여기서 암호문이 나온다
    expect(await decryptTags(item.tags, key)).toEqual(['prod'])
    expect(await decryptFolderName(folder.name, key)).toBe('사내 인프라')
  })

  it('암호화 미사용 기기(키 없음)로 가져오면 백업 값을 그대로 둔다', async () => {
    await importData(backup([{ id: 1, name: '일반폴더' }], ['plain']), 'append', null)

    const item = (await db.items.toArray())[0]
    const folder = (await db.folders.toArray())[0]
    expect(item.tags).toEqual(['plain'])
    expect(folder.name).toBe('일반폴더')
  })

  it('태그가 없는 항목도 안전하게 가져온다', async () => {
    await importData(backup([{ id: 1, name: 'f' }], []), 'append', key)
    expect((await db.items.toArray())[0].tags).toEqual([])
  })
})
