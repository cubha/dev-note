// import.ts의 insertFoldersAndItems는 Dexie 트랜잭션 안에서 encryptFolderName/encryptTags를
// await한다. Dexie 트랜잭션은 non-Dexie 프라미스를 기다리는 순간 조기 커밋되므로(zone 이탈),
// 이후 쓰기가 거부되거나(TransactionInactiveError) replace 모드에서는 앞서 실행된 clear()만
// durable하게 남아 기존 데이터가 전소실된다(ANALYSIS-encryption-closure-2026-08-08.md §3).
//
// 실제 브라우저 WebCrypto는 매크로태스크 경계를 넘는 경우가 흔하지만 테스트 환경(fake-indexeddb
// + Node crypto)에서는 항상 재현되지 않는다 — 그래서 encryptFolderName/encryptTags에 매크로태스크
// 지연을 주입해 그 조건을 결정론적으로 재현한다.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../core/metaCrypto', async () => {
  const actual = await vi.importActual<typeof import('../core/metaCrypto')>('../core/metaCrypto')
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  return {
    ...actual,
    encryptFolderName: async (name: string, key: CryptoKey) => {
      await delay()
      return actual.encryptFolderName(name, key)
    },
    encryptTags: async (tags: string[], key: CryptoKey) => {
      await delay()
      return actual.encryptTags(tags, key)
    },
  }
})

import { db, ensureConfig } from '../core/db'
import { importData } from '../features/storage/import'
import { deriveKey, generateSalt } from '../core/crypto'
import type { Item, Folder } from '../core/db'

describe('가져오기 트랜잭션 원자성 — 암호화 지연 하에서도 데이터 무결', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
    await db.config.clear()
    await ensureConfig()
  })

  it('replace 모드: 암호화 지연으로 트랜잭션이 끊겨도 기존 데이터가 사라지지 않고 새 데이터가 온전히 들어온다', async () => {
    const key = await deriveKey('p', generateSalt())
    await db.items.add({
      folderId: null, title: '기존카드', type: 'note', tags: [],
      content: '{"format":"legacy","text":"소중한 데이터"}',
      order: 0, pinned: false, updatedAt: 1, createdAt: 1,
    } as Omit<Item, 'id'>)

    const backup = JSON.stringify({
      version: 2,
      exportedAt: 1,
      folders: [{ id: 1, parentId: null, name: '가져온폴더', order: 0, createdAt: 1 }],
      items: [{
        id: 1, folderId: 1, title: '가져온카드', type: 'note', tags: ['x'],
        content: '{"format":"legacy","text":"new"}', order: 0, pinned: false, updatedAt: 1, createdAt: 1,
      }],
    })

    await importData(backup, 'replace', key)

    const items = await db.items.toArray()
    const folders = await db.folders.toArray()
    expect(items.length).toBe(1)
    expect(items[0].title).toBe('가져온카드')
    expect(folders.length).toBe(1)
    expect(folders[0].name).not.toBe('가져온폴더') // 암호화되어 있어야 함(atRestKey 전달됨)
  })

  it('append 모드: 암호화 지연이 있어도 실패 없이 기존+가져온 데이터가 모두 존재한다', async () => {
    const key = await deriveKey('p', generateSalt())
    await db.items.add({
      folderId: null, title: '기존카드', type: 'note', tags: [],
      content: '{"format":"legacy","text":"x"}',
      order: 0, pinned: false, updatedAt: 1, createdAt: 1,
    } as Omit<Item, 'id'>)

    const backup = JSON.stringify({
      version: 2,
      exportedAt: 1,
      folders: [] as Folder[],
      items: [{
        id: 1, folderId: null, title: '가져온카드', type: 'note', tags: [],
        content: '{"format":"legacy","text":"new"}', order: 0, pinned: false, updatedAt: 1, createdAt: 1,
      }],
    })

    await importData(backup, 'append', key)

    const items = await db.items.toArray()
    expect(items.length).toBe(2)
  })
})
