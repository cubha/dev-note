import { describe, it, expect } from 'vitest'
import { collectMatches, applyReplaceAll, applyReplaceOne } from '../core/cardSearch'
import type { SearchTarget } from '../core/cardSearch'

const T = (path: string, text: string): SearchTarget => ({ path, text, widget: 'input' })

describe('collectMatches — 매치 수집', () => {
  it('여러 타깃에 걸쳐 화면 순서대로 매치를 모은다', () => {
    const m = collectMatches([T('a', 'foo bar foo'), T('b', 'baz foo')], 'foo', {})
    expect(m).toHaveLength(3)
    expect(m.map(x => x.path)).toEqual(['a', 'a', 'b'])
    expect(m[0]).toMatchObject({ start: 0, end: 3 })
    expect(m[1]).toMatchObject({ start: 8, end: 11 })
  })

  it('기본은 대소문자 무시', () => {
    expect(collectMatches([T('a', 'Foo FOO foo')], 'foo', {})).toHaveLength(3)
  })

  it('caseSensitive면 정확히 일치하는 것만', () => {
    expect(collectMatches([T('a', 'Foo FOO foo')], 'foo', { caseSensitive: true })).toHaveLength(1)
  })

  it('일반 모드에서는 백슬래시를 리터럴로 다룬다 — 경로 검색이 깨지면 안 된다', () => {
    const m = collectMatches([T('a', 'path = C:\\temp\\logs')], 'C:\\temp', {})
    expect(m).toHaveLength(1)
  })

  it('일반 모드에서는 정규식 메타문자도 리터럴이다', () => {
    expect(collectMatches([T('a', 'a.b axb')], 'a.b', {})).toHaveLength(1)
  })

  it('regexp 모드에서는 정규식으로 해석한다', () => {
    expect(collectMatches([T('a', 'a.b axb')], 'a.b', { regexp: true })).toHaveLength(2)
  })

  it('잘못된 정규식은 빈 결과를 주고 throw하지 않는다', () => {
    expect(() => collectMatches([T('a', 'x')], '[', { regexp: true })).not.toThrow()
    expect(collectMatches([T('a', 'x')], '[', { regexp: true })).toEqual([])
  })

  it('wholeWord는 단어 경계에서만 매치한다', () => {
    const m = collectMatches([T('a', 'foo food foo')], 'foo', { wholeWord: true })
    expect(m).toHaveLength(2)
  })

  it('빈 검색어는 매치 없음', () => {
    expect(collectMatches([T('a', 'abc')], '', {})).toEqual([])
  })

  it('빈 매치를 만드는 정규식에서 무한루프에 빠지지 않는다', () => {
    const m = collectMatches([T('a', 'abc')], 'x*', { regexp: true })
    expect(m.length).toBeLessThanOrEqual(4)
  })
})

describe('applyReplaceOne / applyReplaceAll — 바꾸기', () => {
  const targets = [T('a', 'foo bar foo'), T('b', 'baz foo')]

  it('한 건만 바꾼다 — 나머지는 그대로', () => {
    const matches = collectMatches(targets, 'foo', {})
    const result = applyReplaceOne(targets, matches[1], 'X')
    expect(result.find(t => t.path === 'a')!.text).toBe('foo bar X')
    expect(result.find(t => t.path === 'b')!.text).toBe('baz foo')
  })

  it('모두 바꾸기가 섹션(타깃) 경계를 넘어 전부 적용된다', () => {
    const matches = collectMatches(targets, 'foo', {})
    const result = applyReplaceAll(targets, matches, 'X')
    expect(result.find(t => t.path === 'a')!.text).toBe('X bar X')
    expect(result.find(t => t.path === 'b')!.text).toBe('baz X')
  })

  it('길이가 달라지는 치환에서도 같은 타깃의 뒤쪽 매치가 밀리지 않는다', () => {
    // 앞에서부터 적용하면 두 번째 매치 인덱스가 어긋난다 — 뒤에서 앞으로 적용해야 한다
    const one = [T('a', 'ab ab ab')]
    const matches = collectMatches(one, 'ab', {})
    expect(applyReplaceAll(one, matches, 'LONGER')[0].text).toBe('LONGER LONGER LONGER')
  })

  it('치환 문자열이 더 짧아도 정확히 적용된다', () => {
    const one = [T('a', 'aaaa bbbb aaaa')]
    const matches = collectMatches(one, 'aaaa', {})
    expect(applyReplaceAll(one, matches, 'z')[0].text).toBe('z bbbb z')
  })

  it('원본 배열을 변경하지 않는다', () => {
    const one = [T('a', 'foo')]
    const matches = collectMatches(one, 'foo', {})
    applyReplaceAll(one, matches, 'bar')
    expect(one[0].text).toBe('foo')
  })

  it('매치가 없으면 원본과 같은 내용을 돌려준다', () => {
    expect(applyReplaceAll(targets, [], 'X').map(t => t.text)).toEqual(targets.map(t => t.text))
  })
})
