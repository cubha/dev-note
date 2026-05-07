import { describe, it, expect } from 'vitest'
import {
  parseContent,
  serializeContent,
  extractSearchText,
  createSection,
  createEmptyHybridContent,
  DOCUMENT_PRESETS,
} from '../core/content'
import type { HybridContent, StructuredContent } from '../core/types'

// ── parseContent ───────────────────────────────────────────────

describe('parseContent', () => {
  it('null → legacy 빈 텍스트', () => {
    const result = parseContent(null)
    expect(result.format).toBe('legacy')
    expect((result as { format: string; text: string }).text).toBe('')
  })

  it('빈 문자열 → legacy 빈 텍스트', () => {
    const result = parseContent('')
    expect(result.format).toBe('legacy')
  })

  it('일반 텍스트 → legacy', () => {
    const result = parseContent('hello world')
    expect(result.format).toBe('legacy')
    expect((result as { format: string; text: string }).text).toBe('hello world')
  })

  it('올바른 hybrid JSON → HybridContent 반환', () => {
    const hybrid: HybridContent = {
      format: 'hybrid',
      sections: [
        { id: 'abc', type: 'markdown', title: '메모', collapsed: false, text: '내용' },
      ],
    }
    const result = parseContent(JSON.stringify(hybrid))
    expect(result.format).toBe('hybrid')
    expect((result as HybridContent).sections).toHaveLength(1)
  })

  it('올바른 structured JSON → StructuredContent 반환', () => {
    const structured: StructuredContent = {
      format: 'structured',
      fields: [{ key: 'host', label: '호스트', value: 'localhost', type: 'text' }],
    }
    const result = parseContent(JSON.stringify(structured))
    expect(result.format).toBe('structured')
    expect((result as StructuredContent).fields).toHaveLength(1)
  })

  it('sections에 유효하지 않은 항목 → legacy fallback', () => {
    const invalid = JSON.stringify({
      format: 'hybrid',
      sections: [{ id: 123, type: 'unknown' }], // 유효하지 않음
    })
    const result = parseContent(invalid)
    expect(result.format).toBe('legacy')
  })

  it('잘못된 JSON → legacy', () => {
    const result = parseContent('{broken json}}')
    expect(result.format).toBe('legacy')
  })
})

// ── serializeContent ───────────────────────────────────────────

describe('serializeContent', () => {
  it('HybridContent → JSON string', () => {
    const content: HybridContent = {
      format: 'hybrid',
      sections: [
        { id: 'x1', type: 'markdown', title: '메모', collapsed: false, text: '내용' },
      ],
    }
    const json = serializeContent(content)
    const parsed = JSON.parse(json) as HybridContent
    expect(parsed.format).toBe('hybrid')
    const first = parsed.sections[0]
    expect(first.type === 'markdown' && first.text).toBe('내용')
  })
})

// ── createSection ──────────────────────────────────────────────

describe('createSection', () => {
  it('markdown 섹션 생성', () => {
    const s = createSection('markdown')
    expect(s.type).toBe('markdown')
    expect(typeof s.id).toBe('string')
    expect(s.collapsed).toBe(false)
  })

  it('credentials 섹션 생성', () => {
    const s = createSection('credentials')
    expect(s.type).toBe('credentials')
    expect((s as import('../core/types').CredentialSection).items).toHaveLength(0)
  })

  it('env 섹션 생성', () => {
    const s = createSection('env')
    expect(s.type).toBe('env')
    expect((s as import('../core/types').EnvSection).pairs).toHaveLength(0)
  })

  it('각 섹션 ID는 고유하다', () => {
    const ids = Array.from({ length: 5 }, () => createSection('markdown').id)
    const unique = new Set(ids)
    expect(unique.size).toBe(5)
  })
})

// ── createEmptyHybridContent ───────────────────────────────────

describe('createEmptyHybridContent', () => {
  it('format이 hybrid이고 섹션 1개 포함', () => {
    const c = createEmptyHybridContent()
    expect(c.format).toBe('hybrid')
    expect(c.sections).toHaveLength(1)
    expect(c.sections[0].type).toBe('markdown')
  })
})

// ── extractSearchText ──────────────────────────────────────────

describe('extractSearchText', () => {
  it('legacy → text 반환', () => {
    const text = extractSearchText({ format: 'legacy', text: 'hello' })
    expect(text).toBe('hello')
  })

  it('structured → password 필드 제외', () => {
    const content: StructuredContent = {
      format: 'structured',
      fields: [
        { key: 'user', label: '사용자', value: 'admin', type: 'text' },
        { key: 'pw', label: '비밀번호', value: 'secret', type: 'password' },
      ],
    }
    const text = extractSearchText(content)
    expect(text).toContain('admin')
    expect(text).not.toContain('secret')
  })

  it('hybrid markdown 섹션 → text 포함', () => {
    const content: HybridContent = {
      format: 'hybrid',
      sections: [
        { id: 'x', type: 'markdown', title: '메모', collapsed: false, text: '중요 내용' },
      ],
    }
    const text = extractSearchText(content)
    expect(text).toContain('중요 내용')
  })

  it('hybrid env 섹션 → secret=false인 key만 포함', () => {
    const content: HybridContent = {
      format: 'hybrid',
      sections: [
        {
          id: 'e1',
          type: 'env',
          title: '환경변수',
          collapsed: false,
          pairs: [
            { id: 'e1', key: 'DB_HOST', value: 'localhost', secret: false },
            { id: 'e2', key: 'DB_PASS', value: 'secret', secret: true },
          ],
        },
      ],
    }
    const text = extractSearchText(content)
    expect(text).toContain('DB_HOST=localhost')
    expect(text).toContain('DB_PASS')
    expect(text).not.toContain('secret')
  })
})

// ── DOCUMENT_PRESETS ───────────────────────────────────────────

describe('DOCUMENT_PRESETS', () => {
  it('4개 프리셋 존재', () => {
    expect(DOCUMENT_PRESETS).toHaveLength(4)
  })

  it('모든 프리셋에 id/label/description/sections 존재', () => {
    for (const preset of DOCUMENT_PRESETS) {
      expect(preset.id).toBeTruthy()
      expect(preset.label).toBeTruthy()
      expect(preset.description).toBeTruthy()
      expect(Array.isArray(preset.sections)).toBe(true)
    }
  })

  it('empty 프리셋은 섹션 0개', () => {
    const empty = DOCUMENT_PRESETS.find((p) => p.id === 'empty')
    expect(empty?.sections).toHaveLength(0)
  })

  it('server 프리셋은 credentials + markdown 2개', () => {
    const server = DOCUMENT_PRESETS.find((p) => p.id === 'server')
    expect(server?.sections).toHaveLength(2)
    expect(server?.sections[0].type).toBe('credentials')
    expect(server?.sections[1].type).toBe('markdown')
  })
})
