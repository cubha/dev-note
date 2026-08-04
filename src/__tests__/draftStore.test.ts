import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../core/db'
import { saveDraft, deleteDraft, deleteDrafts, loadDraft, listDraftItemIds } from '../core/draftStore'

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
