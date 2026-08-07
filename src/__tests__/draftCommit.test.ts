import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../core/db'
import { saveDraft, loadDraft } from '../core/draftStore'
import { commitDraftToItem } from '../features/cards/draftCommit'
import { isEncryptedContent, decryptContent, parseContent } from '../core/content'
import { deriveKey, generateSalt } from '../core/crypto'
import type { Item } from '../core/db'

async function addItem(overrides: Partial<Omit<Item, 'id'>> = {}): Promise<number> {
  return (await db.items.add({
    folderId: null, title: '원본 제목', type: 'server', tags: ['old'],
    order: 0, pinned: false, content: '{"format":"structured","fields":[]}',
    updatedAt: 100, createdAt: 100,
    ...overrides,
  } as Omit<Item, 'id'>)) as number
}

describe('commitDraftToItem', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.drafts.clear()
  })

  it('fields 드래프트를 structured content로 커밋하고 드래프트를 삭제한다', async () => {
    const id = await addItem()
    await saveDraft(id, {
      title: '수정된 제목', type: 'server', tags: 'a, b', baseUpdatedAt: 100,
      body: { kind: 'fields', fields: [['host', '10.0.0.1']], editorText: '메모' },
    })

    await commitDraftToItem(id, false, null)

    const item = await db.items.get(id)
    expect(item?.title).toBe('수정된 제목')
    expect(item?.tags).toEqual(['a', 'b'])
    const content = parseContent(item?.content ?? null)
    expect(content.format).toBe('structured')
    if (content.format === 'structured') {
      const host = content.fields.find(f => f.key === 'host')
      const note = content.fields.find(f => f.key === 'note')
      expect(host?.value).toBe('10.0.0.1')
      expect(note?.value).toBe('메모')
    }
    expect(await loadDraft(id)).toBeUndefined()
  })

  it('document 드래프트를 hybrid content로 커밋한다', async () => {
    const id = await addItem({ type: 'document', content: '{"format":"hybrid","sections":[]}' })
    await saveDraft(id, {
      title: '문서 제목', type: 'document', tags: '', baseUpdatedAt: 100,
      body: { kind: 'document', sections: [{ id: 's1', type: 'markdown', title: '메모', collapsed: false, text: 'hello' }] },
    })

    await commitDraftToItem(id, false, null)

    const item = await db.items.get(id)
    const content = parseContent(item?.content ?? null)
    expect(content.format).toBe('hybrid')
    if (content.format === 'hybrid') {
      expect(content.sections).toHaveLength(1)
      expect(content.sections[0].title).toBe('메모')
    }
  })

  it('드래프트가 없으면 아이템을 건드리지 않는다', async () => {
    const id = await addItem()
    await commitDraftToItem(id, false, null)
    const item = await db.items.get(id)
    expect(item?.title).toBe('원본 제목')
  })

  it('아이템이 이미 삭제됐으면 드래프트만 정리한다(크래시 없음)', async () => {
    const id = await addItem()
    await saveDraft(id, {
      title: 'x', type: 'server', tags: '', baseUpdatedAt: 100,
      body: { kind: 'fields', fields: [], editorText: '' },
    })
    await db.items.delete(id)

    await expect(commitDraftToItem(id, false, null)).resolves.not.toThrow()
    expect(await loadDraft(id)).toBeUndefined()
  })

  it('손상된 드래프트(body 파싱 실패)는 버리고 아이템은 그대로 둔다', async () => {
    const id = await addItem()
    await db.drafts.put({ itemId: id, title: 'x', type: 'server', tags: '', body: '{not json', baseUpdatedAt: 100, updatedAt: 100 })

    await commitDraftToItem(id, false, null)

    const item = await db.items.get(id)
    expect(item?.title).toBe('원본 제목')
    expect(await loadDraft(id)).toBeUndefined()
  })

  it('암호화 활성 상태면 커밋된 content가 암호화된다', async () => {
    const id = await addItem()
    await saveDraft(id, {
      title: '제목', type: 'server', tags: '', baseUpdatedAt: 100,
      body: { kind: 'fields', fields: [['host', '1.2.3.4']], editorText: '' },
    })
    const key = await deriveKey('passphrase', generateSalt())

    await commitDraftToItem(id, true, key)

    const item = await db.items.get(id)
    expect(isEncryptedContent(item?.content ?? '')).toBe(true)
    const decrypted = await decryptContent(item?.content ?? '', key)
    const content = parseContent(decrypted)
    expect(content.format).toBe('structured')
  })

  it('암호화 활성 상태인데 키가 없으면(잠김) 평문 저장 대신 에러를 던지고 아이템을 건드리지 않는다', async () => {
    const id = await addItem()
    await saveDraft(id, {
      title: '제목', type: 'server', tags: '', baseUpdatedAt: 100,
      body: { kind: 'fields', fields: [['host', '1.2.3.4']], editorText: '' },
    })

    await expect(commitDraftToItem(id, true, null)).rejects.toThrow()

    const item = await db.items.get(id)
    expect(item?.title).toBe('원본 제목')
    expect(item?.content).toBe('{"format":"structured","fields":[]}')
    // 드래프트도 그대로 남아있어야 한다(폐기 아님 — 잠금 해제 후 재시도 가능해야 함)
    expect(await loadDraft(id)).not.toBeUndefined()
  })

  it('드래프트 body 자체가 암호화된 채 잠긴(키 없음) 경우도 폐기 없이 에러를 던진다', async () => {
    const id = await addItem()
    const key = await deriveKey('passphrase', generateSalt())
    await saveDraft(id, {
      title: '제목', type: 'server', tags: '', baseUpdatedAt: 100,
      body: { kind: 'fields', fields: [['host', '1.2.3.4']], editorText: '' },
    }, key)

    await expect(commitDraftToItem(id, true, null)).rejects.toThrow()

    const item = await db.items.get(id)
    expect(item?.title).toBe('원본 제목')
    expect(await loadDraft(id)).not.toBeUndefined()
  })

  it('암호화된 드래프트를 올바른 키로 커밋하면 정상적으로 아이템에 반영되고 드래프트가 삭제된다', async () => {
    const id = await addItem()
    const key = await deriveKey('passphrase', generateSalt())
    await saveDraft(id, {
      title: '수정된 제목', type: 'server', tags: 'x', baseUpdatedAt: 100,
      body: { kind: 'fields', fields: [['host', '5.5.5.5']], editorText: '' },
    }, key)

    await commitDraftToItem(id, true, key)

    const item = await db.items.get(id)
    expect(item?.title).toBe('수정된 제목')
    expect(isEncryptedContent(item?.content ?? '')).toBe(true)
    const decrypted = await decryptContent(item?.content ?? '', key)
    const content = parseContent(decrypted)
    expect(content.format).toBe('structured')
    if (content.format === 'structured') {
      const host = content.fields.find((f) => f.key === 'host')
      expect(host?.value).toBe('5.5.5.5')
    }
    expect(await loadDraft(id)).toBeUndefined()
  })
})
