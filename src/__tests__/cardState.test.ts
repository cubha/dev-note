import { describe, it, expect } from 'vitest'
import { isCardEmpty, isDraft } from '../core/cardState'
import type { CardContent } from '../core/types'

describe('isCardEmpty', () => {
  it('legacy: 빈 텍스트는 비어있음', () => {
    const content: CardContent = { format: 'legacy', text: '' }
    expect(isCardEmpty('', content)).toBe(true)
  })

  it('legacy: 텍스트가 있으면 비어있지 않음', () => {
    const content: CardContent = { format: 'legacy', text: '메모' }
    expect(isCardEmpty('', content)).toBe(false)
  })

  it('structured: 전 필드 빈 값이면 비어있음', () => {
    const content: CardContent = {
      format: 'structured',
      fields: [
        { key: 'host', label: 'Host', value: '', type: 'text' },
        { key: 'port', label: 'Port', value: '  ', type: 'number' },
      ],
    }
    expect(isCardEmpty('', content)).toBe(true)
  })

  it('structured: 한 필드라도 값이 있으면 비어있지 않음', () => {
    const content: CardContent = {
      format: 'structured',
      fields: [
        { key: 'host', label: 'Host', value: '10.0.0.1', type: 'text' },
      ],
    }
    expect(isCardEmpty('', content)).toBe(false)
  })

  it('제목만 있고 내용이 비어도 비어있지 않음(제목 없음만 draft 대상 아님)', () => {
    const content: CardContent = { format: 'structured', fields: [] }
    expect(isCardEmpty('내 카드', content)).toBe(false)
  })

  it('hybrid: 기본 생성 문서(빈 markdown 섹션, title="메모")는 비어있음 — title은 판정 제외', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [
        { id: '1', type: 'markdown', title: '메모', collapsed: false, text: '' },
      ],
    }
    expect(isCardEmpty('', content)).toBe(true)
  })

  it('hybrid: markdown 섹션에 텍스트가 있으면 비어있지 않음', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [
        { id: '1', type: 'markdown', title: '메모', collapsed: false, text: '내용' },
      ],
    }
    expect(isCardEmpty('', content)).toBe(false)
  })

  it('hybrid: credentials 섹션에 항목이 있으면 비어있지 않음', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [
        {
          id: '1', type: 'credentials', title: '', collapsed: false,
          items: [{ id: 'c1', label: '운영', category: 'server', host: 'h', port: '22', username: 'u', password: '', extra: '' }],
        },
      ],
    }
    expect(isCardEmpty('', content)).toBe(false)
  })

  it('hybrid: env 섹션에 pair가 없으면 비어있음', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [{ id: '1', type: 'env', title: '', collapsed: false, pairs: [] }],
    }
    expect(isCardEmpty('', content)).toBe(true)
  })

  it('hybrid: code 섹션에 코드가 있으면 비어있지 않음', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [{ id: '1', type: 'code', title: '', collapsed: false, language: 'bash', code: 'ls -la' }],
    }
    expect(isCardEmpty('', content)).toBe(false)
  })

  it('hybrid: 섹션이 여러 개면 전부 비어야 비어있음 판정', () => {
    const content: CardContent = {
      format: 'hybrid',
      sections: [
        { id: '1', type: 'markdown', title: '', collapsed: false, text: '' },
        { id: '2', type: 'code', title: '', collapsed: false, language: 'bash', code: 'echo hi' },
      ],
    }
    expect(isCardEmpty('', content)).toBe(false)
  })
})

describe('isDraft', () => {
  it('draft === true면 true', () => {
    expect(isDraft({ draft: true })).toBe(true)
  })

  it('draft === false면 false', () => {
    expect(isDraft({ draft: false })).toBe(false)
  })

  it('draft === undefined(기존 카드)면 false', () => {
    expect(isDraft({ draft: undefined })).toBe(false)
  })
})
