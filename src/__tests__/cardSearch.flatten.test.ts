import { describe, it, expect } from 'vitest'
import { flattenCard } from '../core/cardSearch'
import type { AnySection } from '../core/types'

// 카드 안 모든 텍스트를 "검색 타깃" 평면 목록으로 펼친다.
// 여기서 마스킹 필드를 배제해두면 이후 검색·이동·바꾸기 단계는 마스킹을 몰라도 된다.

const sec = <T extends AnySection>(s: T): T => s

describe('flattenCard — 섹션 평탄화', () => {
  it('code 섹션의 코드를 타깃으로 만든다', () => {
    const targets = flattenCard({
      sections: [sec({ id: 's1', type: 'code', title: '스니펫', collapsed: false, language: 'bash', code: 'echo hello' })],
    })
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ text: 'echo hello', widget: 'cm', sectionId: 's1' })
  })

  it('markdown 섹션의 본문을 타깃으로 만든다', () => {
    const targets = flattenCard({
      sections: [sec({ id: 's1', type: 'markdown', title: '메모', collapsed: false, text: '내용입니다' })],
    })
    expect(targets).toHaveLength(1)
    expect(targets[0]).toMatchObject({ text: '내용입니다', widget: 'textarea' })
  })

  it('credentials 항목의 각 필드를 개별 타깃으로 펼친다 — password는 제외', () => {
    const targets = flattenCard({
      sections: [sec({
        id: 's1', type: 'credentials', title: '접속', collapsed: false,
        items: [{
          id: 'c1', label: '운영', category: 'server',
          host: '10.0.0.1', port: '22', username: 'admin',
          password: 'SUPERSECRET', database: 'prod', extra: '비고내용',
        }],
      })],
    })
    const texts = targets.map(t => t.text)
    expect(texts).toContain('10.0.0.1')
    expect(texts).toContain('admin')
    expect(texts).toContain('비고내용')
    expect(texts).not.toContain('SUPERSECRET')   // 마스킹 필드 제외
    expect(targets.every(t => t.widget === 'input')).toBe(true)
  })

  it('env 쌍을 펼치되 secret:true인 값은 제외한다 (키는 남긴다)', () => {
    const targets = flattenCard({
      sections: [sec({
        id: 's1', type: 'env', title: '환경변수', collapsed: false,
        pairs: [
          { id: 'e1', key: 'API_URL', value: 'https://api.example.com', secret: false },
          { id: 'e2', key: 'API_KEY', value: 'sk-SECRET-VALUE', secret: true },
        ],
      })],
    })
    const texts = targets.map(t => t.text)
    expect(texts).toContain('API_URL')
    expect(texts).toContain('https://api.example.com')
    expect(texts).toContain('API_KEY')            // 키 이름은 검색 대상
    expect(texts).not.toContain('sk-SECRET-VALUE') // secret 값은 제외
  })

  it('urls 항목과 메모카드까지 펼친다', () => {
    const targets = flattenCard({
      sections: [sec({
        id: 's1', type: 'urls', title: '링크', collapsed: false,
        items: [{
          id: 'u1', label: '관리자', url: 'https://admin.example.com', method: 'GET', note: '메모다',
          noteCards: [{ id: 'n1', title: '카드제목', text: '카드본문' }],
        }],
      })],
    })
    const texts = targets.map(t => t.text)
    expect(texts).toContain('관리자')
    expect(texts).toContain('https://admin.example.com')
    expect(texts).toContain('메모다')
    expect(texts).toContain('카드제목')
    expect(texts).toContain('카드본문')
    // method는 Badge 표시 전용이라 편집 위젯이 없다 — 이동 불가능한 매치를 만들지 않는다
    expect(texts).not.toContain('GET')
  })

  it('빈 문자열은 타깃으로 만들지 않는다', () => {
    const targets = flattenCard({
      sections: [sec({ id: 's1', type: 'markdown', title: '', collapsed: false, text: '' })],
    })
    expect(targets).toHaveLength(0)
  })

  it('접힌 섹션도 타깃에 포함한다 — 이동 시 펼치면 되므로', () => {
    const targets = flattenCard({
      sections: [sec({ id: 's1', type: 'markdown', title: '접힘', collapsed: true, text: '숨은내용' })],
    })
    expect(targets).toHaveLength(1)
    expect(targets[0].collapsed).toBe(true)
  })

  it('여러 섹션을 화면 순서대로 이어붙인다', () => {
    const targets = flattenCard({
      sections: [
        sec({ id: 's1', type: 'markdown', title: '', collapsed: false, text: '첫째' }),
        sec({ id: 's2', type: 'code', title: '', collapsed: false, language: 'bash', code: '둘째' }),
      ],
    })
    expect(targets.map(t => t.text)).toEqual(['첫째', '둘째'])
  })

  it('path가 타깃마다 고유하다 — 이동·바꾸기의 식별자', () => {
    const targets = flattenCard({
      sections: [sec({
        id: 's1', type: 'env', title: '', collapsed: false,
        pairs: [
          { id: 'e1', key: 'A', value: '1', secret: false },
          { id: 'e2', key: 'B', value: '2', secret: false },
        ],
      })],
    })
    const paths = targets.map(t => t.path)
    expect(new Set(paths).size).toBe(paths.length)
  })
})

describe('flattenCard — structured 카드(server/db/api/note)', () => {
  it('정형 필드와 하단 에디터 텍스트를 함께 펼치고 password는 제외한다', () => {
    const targets = flattenCard({
      fields: { host: '10.0.0.9', username: 'root', password: 'PW-SECRET', note: '비고텍스트' },
      fieldTypes: { host: 'text', username: 'text', password: 'password', note: 'multiline' },
    })
    const texts = targets.map(t => t.text)
    expect(texts).toContain('10.0.0.9')
    expect(texts).toContain('root')
    expect(texts).toContain('비고텍스트')
    expect(texts).not.toContain('PW-SECRET')
  })

  it('multiline 필드는 CodeMirror 위젯으로 표시한다', () => {
    const targets = flattenCard({
      fields: { note: '여러 줄\n내용' },
      fieldTypes: { note: 'multiline' },
    })
    expect(targets[0].widget).toBe('cm')
  })
})
