/**
 * data-search-path 계약의 기계 강제.
 *
 * flattenCard가 만드는 path 하나하나에 대응하는 DOM 노드가 없으면 focusMatch는 **에러 없이
 * 조용히 아무것도 안 한다** — 이 기능의 원래 결함이 정확히 그 모양이었다(값 동등성으로 찾다가
 * 늘 첫 요소를 집었고, 아무도 몰랐다). 그래서 "붙였는지 눈으로 확인"에 맡기지 않는다.
 *
 * 렌더는 react-dom/server로 한다 — jsdom·RTL을 새로 들이지 않고 node 환경 그대로 돌리기 위해서다.
 * 대신 useEffect가 돌지 않으므로 CodeMirror처럼 effect에서 DOM을 채우는 위젯은 호스트 div의
 * 속성만 검사된다(그게 focusMatch가 조회하는 지점이라 충분하다).
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { flattenCard } from '../core/cardSearch'
import type { AnySection, CardField } from '../core/types'
import { SectionContent } from '../features/cards/DocumentEditor'
import { StructuredFieldForm } from '../features/cards/StructuredFieldInput'

const pathsInMarkup = (html: string): string[] =>
  [...html.matchAll(/data-search-path="([^"]*)"/g)].map((m) => m[1])

const renderSection = (section: AnySection): string =>
  renderToStaticMarkup(<SectionContent section={section} onChange={() => {}} />)

const SECTIONS: AnySection[] = [
  { id: 's-md', type: 'markdown', title: '메모', collapsed: false, text: '마크다운 본문' },
  { id: 's-code', type: 'code', title: '코드', collapsed: false, language: 'bash', code: 'echo hi' },
  {
    id: 's-cred', type: 'credentials', title: '접속', collapsed: false,
    items: [{
      id: 'c1', label: '운영', category: 'database', host: '10.0.0.1', port: '5432',
      username: 'admin', password: 'pw', database: 'prod', extra: '비고',
    }],
  },
  {
    // category를 바꿔도 database 값은 데이터에 남는다 — 그때 화면에는 위젯이 없다.
    // 양방향 루프가 이 픽스처로 "타깃은 있는데 DOM이 없다"를 기계로 잡는다.
    id: 's-cred-srv', type: 'credentials', title: '접속(서버)', collapsed: false,
    items: [{
      id: 'c2', label: '웹서버', category: 'server', host: '10.0.0.2', port: '22',
      username: 'root', password: 'pw', database: '남아있는DB이름', extra: '비고2',
    }],
  },
  {
    id: 's-env', type: 'env', title: '환경변수', collapsed: false,
    pairs: [
      { id: 'e1', key: 'API_URL', value: 'https://x', secret: false },
      { id: 'e2', key: 'TOKEN', value: 'sk-secret', secret: true },
    ],
  },
  {
    id: 's-url', type: 'urls', title: '링크', collapsed: false,
    items: [{
      id: 'u1', label: '관리자', url: 'https://admin.example.com', method: 'GET', note: '빠른 메모',
      noteCards: [{ id: 'n1', title: '카드제목', text: '카드본문' }],
    }],
  },
]

describe('data-search-path — flattenCard가 만든 모든 경로에 도달 가능한 DOM이 있다', () => {
  for (const section of SECTIONS) {
    it(`${section.type} 섹션의 모든 타깃에 DOM 노드가 있다`, () => {
      const expected = flattenCard({ sections: [section] }).map((t) => t.path)
      const actual = pathsInMarkup(renderSection(section))

      expect(expected.length).toBeGreaterThan(0) // 픽스처가 비면 테스트가 공허해진다
      for (const path of expected) expect(actual).toContain(path)
    })

    it(`${section.type} 섹션에 타깃 없는 경로를 달지 않는다`, () => {
      const expected = new Set(flattenCard({ sections: [section] }).map((t) => t.path))
      // 빈 값은 flattenCard가 타깃으로 만들지 않으므로 픽스처의 값은 전부 비어있지 않게 둔다
      for (const path of pathsInMarkup(renderSection(section))) {
        expect(expected.has(path)).toBe(true)
      }
    })
  }

  it('마스킹 대상(env secret)에는 경로를 달지 않는다', () => {
    const env = SECTIONS.find((s) => s.id === 's-env')!
    const actual = pathsInMarkup(renderSection(env))
    expect(actual).toContain('sec:s-env:pair:e2:key')
    expect(actual).not.toContain('sec:s-env:pair:e2:value')
  })

  it('credentials의 password에는 경로를 달지 않는다', () => {
    const cred = SECTIONS.find((s) => s.id === 's-cred')!
    expect(pathsInMarkup(renderSection(cred))).not.toContain('sec:s-cred:item:c1:password')
  })

  it('category가 database가 아니면 database 위젯도 경로도 없다', () => {
    const srv = SECTIONS.find((s) => s.id === 's-cred-srv')!
    expect(pathsInMarkup(renderSection(srv))).not.toContain('sec:s-cred-srv:item:c2:database')
    // 평탄화 쪽도 같은 기준이어야 한다 — 한쪽만 막으면 안 보이는 값이 바꾸기로 변한다
    const targets = flattenCard({ sections: [srv] }).map((t) => t.path)
    expect(targets).not.toContain('sec:s-cred-srv:item:c2:database')
  })
})

describe('data-search-path — 정형 카드 필드', () => {
  const fields: CardField[] = [
    { key: 'host', label: 'Host', value: '10.0.0.1', type: 'text' },
    { key: 'port', label: 'Port', value: '22', type: 'number' },
    { key: 'username', label: 'Username', value: 'admin', type: 'text' },
    { key: 'password', label: 'Password', value: 'pw', type: 'password' },
  ]

  it('server 카드의 검색 대상 필드에 경로가 붙는다', () => {
    const html = renderToStaticMarkup(
      <StructuredFieldForm fields={fields} type="server" onFieldChange={() => {}} />,
    )
    const actual = pathsInMarkup(html)
    expect(actual).toContain('field:host')
    expect(actual).toContain('field:port')
    expect(actual).toContain('field:username')
    // 마스킹 필드는 flattenCard가 타깃에서 빼므로 경로도 없다
    expect(actual).not.toContain('field:password')
  })
})
