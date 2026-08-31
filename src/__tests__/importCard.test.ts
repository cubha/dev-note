import { describe, it, expect } from 'vitest'
import { classifyImportFile, buildImportedCard, TEXT_IMPORT_EXTENSIONS, MAX_IMPORT_FILE_BYTES } from '../core/importCard'
import { parseContent, serializeContent } from '../core/content'
import type { AnySection, MarkdownSection } from '../core/types'

function markdownText(section: AnySection): string {
  if (section.type !== 'markdown') throw new Error('markdown 섹션이 아닙니다')
  return (section as MarkdownSection).text
}

describe('classifyImportFile', () => {
  it('.md / .txt는 대소문자 무관하게 text로 분류한다', () => {
    expect(classifyImportFile('a.MD')).toBe('text')
    expect(classifyImportFile('a.TXT')).toBe('text')
    expect(classifyImportFile('a.md')).toBe('text')
    expect(classifyImportFile('a.txt')).toBe('text')
  })

  it('.json은 json으로 분류한다', () => {
    expect(classifyImportFile('backup.JSON')).toBe('json')
    expect(classifyImportFile('backup.json')).toBe('json')
  })

  it('지원하지 않는 확장자·확장자 없음은 unsupported로 분류한다', () => {
    expect(classifyImportFile('photo.png')).toBe('unsupported')
    expect(classifyImportFile('README')).toBe('unsupported')
  })

  it('TEXT_IMPORT_EXTENSIONS 상수가 .txt/.md만 담는다', () => {
    expect(TEXT_IMPORT_EXTENSIONS).toEqual(['.txt', '.md'])
  })

  it('MAX_IMPORT_FILE_BYTES는 5MB다', () => {
    expect(MAX_IMPORT_FILE_BYTES).toBe(5 * 1024 * 1024)
  })
})

describe('buildImportedCard — 제목 추출', () => {
  it('마지막 확장자만 제거한다', () => {
    expect(buildImportedCard('my.notes.v2.md', '본문').title).toBe('my.notes.v2')
  })

  it('확장자만 있는 파일명은 빈 제목이 된다', () => {
    expect(buildImportedCard('.md', '본문').title).toBe('')
  })

  it('앞뒤 공백을 trim한다', () => {
    expect(buildImportedCard('  spaced .md', '본문').title).toBe('spaced')
  })
})

describe('buildImportedCard — 본문 정규화', () => {
  it('CRLF와 단독 CR을 LF로 정규화한다', () => {
    const draft = buildImportedCard('a.txt', 'a\r\nb\rc')
    expect(draft.contentObj.format).toBe('hybrid')
    if (draft.contentObj.format === 'hybrid') {
      expect(markdownText(draft.contentObj.sections[0])).toBe('a\nb\nc')
    }
  })

  it('선두 BOM을 제거한다', () => {
    const draft = buildImportedCard('a.txt', '﻿본문')
    if (draft.contentObj.format === 'hybrid') {
      expect(markdownText(draft.contentObj.sections[0])).toBe('본문')
    }
  })

  it('본문 전문을 보존한다(정규화 대상 외 변형 없음)', () => {
    const original = '# 제목\n\n일반 텍스트\n- 목록'
    const draft = buildImportedCard('a.md', original)
    if (draft.contentObj.format === 'hybrid') {
      expect(markdownText(draft.contentObj.sections[0])).toBe(original)
    }
  })
})

describe('buildImportedCard — 카드 구조', () => {
  it('type은 항상 document, contentObj는 hybrid + markdown 섹션 1개', () => {
    const draft = buildImportedCard('a.md', '본문')
    expect(draft.type).toBe('document')
    expect(draft.contentObj.format).toBe('hybrid')
    if (draft.contentObj.format === 'hybrid') {
      expect(draft.contentObj.sections).toHaveLength(1)
      expect(draft.contentObj.sections[0].type).toBe('markdown')
    }
  })

  it('serializeContent → parseContent 왕복이 유효한 hybrid로 복원된다', () => {
    const draft = buildImportedCard('a.md', '왕복 검증')
    const restored = parseContent(serializeContent(draft.contentObj))
    expect(restored.format).toBe('hybrid')
    if (restored.format === 'hybrid') {
      expect(markdownText(restored.sections[0])).toBe('왕복 검증')
    }
  })
})
