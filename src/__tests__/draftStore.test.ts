import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../core/db'
import { saveDraft, saveDraftRaw, deleteDraft, deleteDrafts, loadDraft, listDraftItemIds, readDraft } from '../core/draftStore'
import { isEncryptedContent } from '../core/content'
import { deriveKey, generateSalt } from '../core/crypto'

describe('draftStore — drafts 테이블 IO', () => {
  beforeEach(async () => {
    await db.drafts.clear()
  })

  it('saveDraft → loadDraft 왕복', async () => {
    await saveDraft(1, { title: '제목', type: 'server', tags: 'a, b', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [['host', '1.1.1.1']], editorText: '메모' } })
    const row = await loadDraft(1)
    expect(row?.itemId).toBe(1)
    expect(row?.title).toBe('제목')
    expect(row?.type).toBe('server')
    expect(row?.tags).toBe('a, b')
    expect(row?.baseUpdatedAt).toBe(1000)
    expect(row?.body).toContain('"kind":"fields"')
  })

  it('saveDraft를 같은 itemId로 다시 호출하면 upsert', async () => {
    await saveDraft(1, { title: 'v1', type: 'note', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } })
    await saveDraft(1, { title: 'v2', type: 'note', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } })
    const rows = await db.drafts.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('v2')
  })

  it('deleteDraft 후 loadDraft는 undefined', async () => {
    await saveDraft(1, { title: 't', type: 'note', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } })
    await deleteDraft(1)
    expect(await loadDraft(1)).toBeUndefined()
  })

  it('deleteDrafts로 여러 건 일괄 삭제', async () => {
    await saveDraft(1, { title: 'a', type: 'note', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } })
    await saveDraft(2, { title: 'b', type: 'note', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } })
    await saveDraft(3, { title: 'c', type: 'note', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } })
    await deleteDrafts([1, 3])
    expect((await listDraftItemIds()).sort()).toEqual([2])
  })

  it('deleteDrafts([]) 는 no-op', async () => {
    await saveDraft(1, { title: 'a', type: 'note', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } })
    await deleteDrafts([])
    expect(await listDraftItemIds()).toEqual([1])
  })

  it('listDraftItemIds는 현재 드래프트가 있는 모든 itemId를 반환', async () => {
    await saveDraft(5, { title: 'x', type: 'document', tags: '', baseUpdatedAt: 1000, body: { kind: 'document', sections: [] } })
    await saveDraft(7, { title: 'y', type: 'db', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } })
    expect((await listDraftItemIds()).sort((a, b) => a - b)).toEqual([5, 7])
  })
})

describe('saveDraft — 암호화 키 전달 시 body 암호화', () => {
  beforeEach(async () => {
    await db.drafts.clear()
  })

  it('encryptionKey 없이 호출하면 body가 평문 그대로 저장된다', async () => {
    await saveDraft(1, { title: 't', type: 'server', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [['host', '1.1.1.1']], editorText: '' } })
    const row = await loadDraft(1)
    expect(isEncryptedContent(row?.body ?? '')).toBe(false)
  })

  it('encryptionKey를 전달하면 body가 암호화되어 저장된다', async () => {
    const key = await deriveKey('passphrase', generateSalt())
    await saveDraft(1, { title: 't', type: 'server', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [['host', '1.1.1.1']], editorText: '' } }, key)
    const row = await loadDraft(1)
    expect(isEncryptedContent(row?.body ?? '')).toBe(true)
  })
})

describe('saveDraftRaw', () => {
  beforeEach(async () => {
    await db.drafts.clear()
  })

  it('전달된 bodyStr을 가공 없이 그대로 기록한다', async () => {
    await saveDraftRaw(1, { title: 't', type: 'note', tags: '', bodyStr: '{"kind":"fields","fields":[],"editorText":"raw"}', baseUpdatedAt: 1000 })
    const row = await loadDraft(1)
    expect(row?.body).toBe('{"kind":"fields","fields":[],"editorText":"raw"}')
  })
})

describe('readDraft', () => {
  beforeEach(async () => {
    await db.drafts.clear()
  })

  it('드래프트가 없으면 none', async () => {
    expect(await readDraft(999, null)).toEqual({ status: 'none' })
  })

  it('평문 드래프트는 키 없이도 ok로 파싱된다', async () => {
    await saveDraft(1, { title: 't', type: 'server', tags: 'a', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [['host', '1.1.1.1']], editorText: '메모' } })
    const result = await readDraft(1, null)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.body).toEqual({ kind: 'fields', fields: [['host', '1.1.1.1']], editorText: '메모' })
      expect(result.draft.title).toBe('t')
    }
  })

  it('암호화된 드래프트인데 키가 없으면 locked', async () => {
    const key = await deriveKey('passphrase', generateSalt())
    await saveDraft(1, { title: 't', type: 'server', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } }, key)
    expect(await readDraft(1, null)).toEqual({ status: 'locked' })
  })

  it('암호화된 드래프트를 올바른 키로 읽으면 ok로 복호화된다', async () => {
    const key = await deriveKey('passphrase', generateSalt())
    await saveDraft(1, { title: 't', type: 'server', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [['host', '9.9.9.9']], editorText: '' } }, key)
    const result = await readDraft(1, key)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.body).toEqual({ kind: 'fields', fields: [['host', '9.9.9.9']], editorText: '' })
    }
  })

  it('암호화된 드래프트를 틀린 키로 읽으면 corrupt', async () => {
    const key = await deriveKey('passphrase', generateSalt())
    const wrongKey = await deriveKey('other-passphrase', generateSalt())
    await saveDraft(1, { title: 't', type: 'server', tags: '', baseUpdatedAt: 1000, body: { kind: 'fields', fields: [], editorText: '' } }, key)
    expect(await readDraft(1, wrongKey)).toEqual({ status: 'corrupt' })
  })

  it('손상된(파싱 불가) 평문 드래프트는 corrupt', async () => {
    await saveDraftRaw(1, { title: 't', type: 'server', tags: '', bodyStr: '{not json', baseUpdatedAt: 1000 })
    expect(await readDraft(1, null)).toEqual({ status: 'corrupt' })
  })
})
