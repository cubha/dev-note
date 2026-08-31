import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../core/db'
import { importTextFilesAsCards } from '../features/storage/importTextCard'
import { isEncryptedContent, decryptContent, parseContent } from '../core/content'
import { deriveKey, generateSalt } from '../core/crypto'
import type { AnySection, MarkdownSection } from '../core/types'

function markdownText(section: AnySection): string {
  if (section.type !== 'markdown') throw new Error('markdown 섹션이 아닙니다')
  return (section as MarkdownSection).text
}

describe('importTextFilesAsCards', () => {
  beforeEach(async () => {
    await db.items.clear()
  })

  it('파일 1건 → document 타입 카드 1건이 발행 상태로 생성된다', async () => {
    const summary = await importTextFilesAsCards(
      [{ name: 'notes.md', text: '본문' }], null, false, null,
    )
    expect(summary.created).toHaveLength(1)
    expect(summary.locked).toBe(0)
    const item = await db.items.get(summary.created[0].itemId)
    expect(item?.title).toBe('notes')
    expect(item?.type).toBe('document')
    expect(item?.draft).toBeFalsy()
  })

  it('동일 이름 2건을 순차 처리해 넘버링이 겹치지 않는다', async () => {
    const summary = await importTextFilesAsCards(
      [
        { name: 'notes.md', text: '첫번째' },
        { name: 'notes.md', text: '두번째' },
      ],
      null, false, null,
    )
    const titles = summary.created.map((c) => c.title)
    expect(titles).toEqual(['notes', 'notes (1)'])
  })

  it('기존에 같은 제목 카드가 있으면 새 카드가 (1)을 받는다', async () => {
    await db.items.add({
      folderId: null, title: 'notes', type: 'note', tags: [],
      order: 0, pinned: false, content: '{}', updatedAt: 0, createdAt: 0,
    })
    const summary = await importTextFilesAsCards(
      [{ name: 'notes.md', text: '본문' }], null, false, null,
    )
    expect(summary.created[0].title).toBe('notes (1)')
  })

  it('folderId를 저장한다', async () => {
    const summary = await importTextFilesAsCards(
      [{ name: 'a.txt', text: '본문' }], 7, false, null,
    )
    const item = await db.items.get(summary.created[0].itemId)
    expect(item?.folderId).toBe(7)
  })

  it('본문 전문을 hybrid markdown 섹션에 보존한다', async () => {
    const summary = await importTextFilesAsCards(
      [{ name: 'a.txt', text: '원문 그대로' }], null, false, null,
    )
    const item = await db.items.get(summary.created[0].itemId)
    const content = parseContent(item?.content ?? null)
    expect(content.format).toBe('hybrid')
    if (content.format === 'hybrid') {
      expect(markdownText(content.sections[0])).toBe('원문 그대로')
    }
  })

  it('암호화 활성 시 content가 암호화된 채 저장되고 복호화하면 원문이 복원된다', async () => {
    const salt = generateSalt()
    const key = await deriveKey('pw', salt)
    const summary = await importTextFilesAsCards(
      [{ name: 'secret.md', text: '민감한 내용' }], null, true, key,
    )
    const item = await db.items.get(summary.created[0].itemId)
    expect(isEncryptedContent(item?.content ?? '')).toBe(true)
    const decrypted = await decryptContent(item?.content ?? '', key)
    const content = parseContent(decrypted)
    if (content.format === 'hybrid') {
      expect(markdownText(content.sections[0])).toBe('민감한 내용')
    }
  })

  it('암호화가 켜졌는데 키가 없으면 locked 처리하고 카드를 만들지 않는다', async () => {
    const before = await db.items.count()
    const summary = await importTextFilesAsCards(
      [{ name: 'a.md', text: '본문' }], null, true, null,
    )
    expect(summary.created).toHaveLength(0)
    expect(summary.locked).toBe(1)
    expect(await db.items.count()).toBe(before)
  })
})
