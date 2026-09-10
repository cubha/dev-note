import { describe, it, expect } from 'vitest'
import {
  collectMatches, nextMatchIndexFrom, sectionPath, fieldPath,
  isPathUnder, flattenCard, writeBackSections,
} from '../core/cardSearch'
import type { SearchTarget } from '../core/cardSearch'
import type { AnySection, CredentialEntry } from '../core/types'

const T = (path: string, text: string): SearchTarget => ({ path, text, widget: 'input' })

/**
 * 바꾸기 후 "다음 대상"은 배열 인덱스로 셀 수 없다 — 치환이 매치 개수를 바꾸기 때문이다.
 * 커서를 (path, offset) 위치로 잡아야 두 경우가 동시에 맞는다:
 *   sc→cs  치환된 매치가 사라져 뒤가 한 칸 당겨진다 (인덱스 유지가 정답)
 *   sc→scc 치환된 자리에 매치가 남는다 (인덱스 전진이 정답)
 */
describe('nextMatchIndexFrom — 위치 기반 커서 전진', () => {
  it('같은 타깃 안에서 커서 이후의 첫 매치를 고른다', () => {
    const targets = [T('a', 'foo foo foo')]
    const matches = collectMatches(targets, 'foo', {})
    expect(nextMatchIndexFrom(matches, targets, { path: 'a', offset: 3 })).toBe(1)
    expect(nextMatchIndexFrom(matches, targets, { path: 'a', offset: 7 })).toBe(2)
  })

  it('커서가 매치 시작과 같은 위치면 그 매치를 고른다(경계 포함)', () => {
    const targets = [T('a', 'foo foo')]
    const matches = collectMatches(targets, 'foo', {})
    expect(nextMatchIndexFrom(matches, targets, { path: 'a', offset: 4 })).toBe(1)
  })

  it('현재 타깃에 남은 매치가 없으면 다음 타깃의 첫 매치로 넘어간다', () => {
    const targets = [T('a', 'foo'), T('b', 'zzz'), T('c', 'foo foo')]
    const matches = collectMatches(targets, 'foo', {})
    expect(nextMatchIndexFrom(matches, targets, { path: 'a', offset: 3 })).toBe(1)
  })

  it('끝까지 남은 매치가 없으면 처음으로 순환한다', () => {
    const targets = [T('a', 'foo'), T('b', 'foo')]
    const matches = collectMatches(targets, 'foo', {})
    expect(nextMatchIndexFrom(matches, targets, { path: 'b', offset: 3 })).toBe(0)
  })

  it('sc→cs: 치환으로 매치가 사라지면 같은 자리가 곧 다음 대상이다', () => {
    // 치환 후 상태 — a는 이미 'cs'라 매치가 없다
    const targets = [T('a', 'cs'), T('b', 'sc'), T('c', 'sc')]
    const matches = collectMatches(targets, 'sc', {})
    // 커서는 a의 치환 끝(offset 2)
    expect(nextMatchIndexFrom(matches, targets, { path: 'a', offset: 2 })).toBe(0)
    expect(matches[0].path).toBe('b')
  })

  it('sc→scc: 치환 자리에 매치가 남아도 같은 건을 다시 잡지 않는다', () => {
    // 치환 후 상태 — a가 'scc'라 offset 0에 매치가 그대로 남는다
    const targets = [T('a', 'scc'), T('b', 'sc')]
    const matches = collectMatches(targets, 'sc', {})
    // 커서는 치환 끝(offset 3) — a의 매치(start 0)는 이미 지나쳤다
    const i = nextMatchIndexFrom(matches, targets, { path: 'a', offset: 3 })
    expect(matches[i].path).toBe('b')
  })

  it('매치가 없으면 0을 돌려준다', () => {
    expect(nextMatchIndexFrom([], [T('a', 'x')], { path: 'a', offset: 0 })).toBe(0)
  })

  it('커서가 가리키는 타깃이 사라졌어도 죽지 않는다', () => {
    const targets = [T('a', 'foo')]
    const matches = collectMatches(targets, 'foo', {})
    expect(nextMatchIndexFrom(matches, targets, { path: '없는path', offset: 0 })).toBe(0)
  })
})

/**
 * 경로 문자열은 flattenCard·writeBackSections·각 섹션 뷰의 data-search-path가 공유하는 계약이다.
 * 세 곳이 각자 문자열을 조립하면 조용히 어긋나므로 빌더 하나만 쓴다.
 */
describe('경로 빌더 — 단일 소스', () => {
  it('섹션 경로를 조립한다', () => {
    expect(sectionPath('s1', 'code')).toBe('sec:s1:code')
    expect(sectionPath('s1', 'pair', 'p2', 'value')).toBe('sec:s1:pair:p2:value')
    expect(sectionPath('s1', 'item', 'i3', 'note', 'n4', 'text')).toBe('sec:s1:item:i3:note:n4:text')
  })

  it('필드 경로를 조립한다', () => {
    expect(fieldPath('host')).toBe('field:host')
  })
})

/**
 * 조건부로만 렌더되는 위젯이 "지금 검색이 나를 가리키는가"를 판정하는 데 쓴다.
 * 세그먼트 경계를 안 보면 `…:note`가 `…:notes`에도 걸린다.
 */
describe('isPathUnder — 경로 포함 판정', () => {
  const note = 'sec:s1:item:u1:note'

  it('자기 자신이면 참', () => {
    expect(isPathUnder(note, note)).toBe(true)
  })

  it('하위 경로면 참', () => {
    expect(isPathUnder('sec:s1:item:u1:note:n4:title', note)).toBe(true)
  })

  it('세그먼트 경계를 넘는 접두사 일치는 거짓', () => {
    expect(isPathUnder('sec:s1:item:u1:notes', note)).toBe(false)
  })

  it('다른 경로·null은 거짓', () => {
    expect(isPathUnder('sec:s1:item:u2:note', note)).toBe(false)
    expect(isPathUnder(null, note)).toBe(false)
  })
})

/**
 * credentials의 database 위젯은 category==='database'일 때만 렌더된다.
 * 카테고리를 바꾸면 값은 데이터에 남는데 화면에는 없다 — 평탄화와 되쓰기가 **같은 기준으로**
 * 막지 않으면 사용자가 볼 수 없는 값이 바꾸기로 조용히 변경된다.
 */
describe('credentials database — 화면에 없는 값은 검색·바꾸기 대상이 아니다', () => {
  const entry = (category: CredentialEntry['category']): CredentialEntry => ({
    id: 'c1', label: '운영', category, host: 'h', port: '1',
    username: 'u', password: 'pw', database: 'sc_db', extra: 'e',
  })
  const section = (category: CredentialEntry['category']): AnySection => ({
    id: 's1', type: 'credentials', title: '접속', collapsed: false, items: [entry(category)],
  })
  const dbPath = sectionPath('s1', 'item', 'c1', 'database')

  it('category=database면 타깃이 된다', () => {
    const paths = flattenCard({ sections: [section('database')] }).map((t) => t.path)
    expect(paths).toContain(dbPath)
  })

  it('category가 database가 아니면 타깃에서 빠진다', () => {
    for (const c of ['server', 'other'] as const) {
      const paths = flattenCard({ sections: [section(c)] }).map((t) => t.path)
      expect(paths).not.toContain(dbPath)
    }
  })

  it('되쓰기도 같은 기준으로 막는다 — 경로가 들어와도 원본 값을 지킨다', () => {
    const targets: SearchTarget[] = [{ path: dbPath, text: '침입값', widget: 'input' }]
    const out = writeBackSections([section('server')], targets)
    const item = out[0].type === 'credentials' ? out[0].items[0] : undefined
    expect(item?.database).toBe('sc_db')
  })

  it('category=database일 때는 되쓰기가 적용된다', () => {
    const targets: SearchTarget[] = [{ path: dbPath, text: 'cs_db', widget: 'input' }]
    const out = writeBackSections([section('database')], targets)
    const item = out[0].type === 'credentials' ? out[0].items[0] : undefined
    expect(item?.database).toBe('cs_db')
  })
})
