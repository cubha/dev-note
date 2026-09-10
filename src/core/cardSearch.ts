// src/core/cardSearch.ts
//
// 카드 전역 검색의 순수 로직 — 뷰·DOM을 모른다.
// 카드를 "검색 타깃" 평면 목록으로 펼치고(flattenCard), 매치를 수집하고(collectMatches),
// 바꾸기를 데이터에 적용한다(applyReplace).

import type { AnySection } from './types'

/** 타깃이 화면에서 어떤 위젯으로 렌더되는가 — 매치 이동 시 분기용 */
export type SearchWidget = 'cm' | 'input' | 'textarea'

export interface SearchTarget {
  /** 타깃 고유 식별자. DOM의 data-search-path와 짝을 이룬다 */
  path: string
  text: string
  widget: SearchWidget
  /** document 카드일 때 소속 섹션 id — 이동 시 펼치기 위해 필요 */
  sectionId?: string
  /** 소속 섹션이 접혀 있는가 */
  collapsed?: boolean
}

export interface FlattenInput {
  /** document 카드의 섹션 배열 */
  sections?: AnySection[]
  /** structured 카드(server/db/api/note)의 필드 값 */
  fields?: Record<string, string>
  /** 필드 키 → FieldType. 'password'는 제외, 'multiline'은 CodeMirror로 렌더된다 */
  fieldTypes?: Record<string, string>
}

/**
 * 마스킹 필드는 여기서 아예 배제한다.
 *
 * 해제 상태(눈 아이콘)가 각 행 컴포넌트의 로컬 state라 상위에서 읽을 수 없고, 접힌 섹션은
 * DOM이 없어 판별도 안 되며, 검색 중 토글하면 매치 개수·인덱스가 흔들린다. 평탄화에서 빼두면
 * 이후 검색·이동·바꾸기 어느 단계도 마스킹을 알 필요가 없다.
 */
const isMaskedFieldType = (type: string | undefined) => type === 'password'

export interface SearchOptions {
  caseSensitive?: boolean
  regexp?: boolean
  wholeWord?: boolean
}

export interface SearchMatch {
  path: string
  start: number
  end: number
}

/** 바꾸기 후 "다음 대상"을 가리키는 커서 — 배열 인덱스가 아니라 문서상의 위치다 */
export interface MatchCursor {
  path: string
  offset: number
}

/**
 * 경로 문자열 빌더 — flattenCard·writeBackSections·각 섹션 뷰의 `data-search-path`가
 * 공유하는 유일한 소스다. 세 곳이 각자 문자열을 조립하면 조용히 어긋나고,
 * 어긋난 결과는 에러가 아니라 "포커스가 안 움직인다"로만 드러난다.
 */
export const sectionPath = (sectionId: string, ...parts: string[]): string =>
  ['sec', sectionId, ...parts].join(':')

export const fieldPath = (key: string): string => `field:${key}`

/**
 * `path`가 `prefix` 자신이거나 그 하위 경로인가.
 *
 * 조건부로만 렌더되는 위젯(접힌 메모·미리보기 모드 등)이 "지금 검색이 나를 가리키는가"를
 * 판정해 스스로 펼치는 데 쓴다. **`startsWith`를 그냥 쓰면 안 된다** — 세그먼트 경계를 보지
 * 않으면 `…:note`가 `…:notes`에도 걸린다.
 */
export const isPathUnder = (path: string | null, prefix: string): boolean =>
  !!path && (path === prefix || path.startsWith(`${prefix}:`))

/**
 * 커서 위치 이후의 첫 매치 인덱스. 없으면 처음으로 순환한다.
 *
 * matches는 targets 순서대로, 타깃 안에서는 오름차순으로 모이므로 이미 문서 순서다.
 * 따라서 targets 순번(rank)과 start만으로 "이 위치보다 뒤"를 판정할 수 있다.
 */
export function nextMatchIndexFrom(
  matches: SearchMatch[], targets: SearchTarget[], cursor: MatchCursor,
): number {
  if (!matches.length) return 0
  const rank = new Map(targets.map((t, i) => [t.path, i]))
  // 커서가 가리키던 타깃이 사라졌으면(-1) 모든 매치가 "뒤"가 되어 자연히 0번이 잡힌다
  const cursorRank = rank.get(cursor.path) ?? -1

  for (let i = 0; i < matches.length; i++) {
    const r = rank.get(matches[i].path) ?? -1
    if (r > cursorRank) return i
    if (r === cursorRank && matches[i].start >= cursor.offset) return i
  }
  return 0
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 검색어를 정규식으로 만든다.
 *
 * 일반 모드는 **입력 그대로** 찾는다 — 이 앱은 `C:\temp` 같은 경로와 코드를 담는 개발 노트라,
 * 이스케이프를 해석하면 "화면에 보이는데 검색이 안 되는" 상태가 된다. 정규식 모드에서만 해석한다.
 * 잘못된 정규식은 null을 반환해 호출부가 빈 결과를 주도록 한다(입력 중 예외로 죽으면 안 된다).
 */
export const buildMatcher = (query: string, o: SearchOptions): RegExp | null => {
  const body = o.regexp ? query : escapeRegExp(query)
  const source = o.wholeWord ? `(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])` : body
  try {
    return new RegExp(source, `gu${o.caseSensitive ? '' : 'i'}`)
  } catch {
    return null
  }
}

export function collectMatches(targets: SearchTarget[], query: string, o: SearchOptions): SearchMatch[] {
  if (!query) return []
  const re = buildMatcher(query, o)
  if (!re) return []

  const matches: SearchMatch[] = []
  for (const target of targets) {
    re.lastIndex = 0
    let hit: RegExpExecArray | null
    while ((hit = re.exec(target.text)) !== null) {
      // 빈 매치(`x*` 등)는 lastIndex가 멈춰 무한루프가 된다 — 한 칸 밀어 진행시킨다.
      if (hit[0] === '') { re.lastIndex += 1; continue }
      matches.push({ path: target.path, start: hit.index, end: hit.index + hit[0].length })
    }
  }
  return matches
}

const replaceInTargets = (
  targets: SearchTarget[],
  matches: SearchMatch[],
  replacement: string,
): SearchTarget[] => {
  if (!matches.length) return targets.map((t) => ({ ...t }))

  const byPath = new Map<string, SearchMatch[]>()
  for (const m of matches) {
    const list = byPath.get(m.path)
    if (list) list.push(m)
    else byPath.set(m.path, [m])
  }

  return targets.map((target) => {
    const own = byPath.get(target.path)
    if (!own) return { ...target }
    // 뒤에서 앞으로 적용한다 — 앞에서부터 자르면 치환 길이 차이만큼 뒤쪽 인덱스가 밀린다.
    const ordered = [...own].sort((a, b) => b.start - a.start)
    let text = target.text
    for (const m of ordered) {
      text = text.slice(0, m.start) + replacement + text.slice(m.end)
    }
    return { ...target, text }
  })
}

export function applyReplaceOne(targets: SearchTarget[], match: SearchMatch, replacement: string): SearchTarget[] {
  return replaceInTargets(targets, [match], replacement)
}

export function applyReplaceAll(targets: SearchTarget[], matches: SearchMatch[], replacement: string): SearchTarget[] {
  return replaceInTargets(targets, matches, replacement)
}

/**
 * 바뀐 타깃 텍스트를 sections 배열에 되쓴다.
 *
 * `flattenCard`가 만든 path를 그대로 역파싱한다. 경로 문자열은 `sectionPath`/`fieldPath`가
 * 유일한 소스이고, 각 섹션 뷰의 `data-search-path`도 같은 함수를 쓴다 —
 * 세 곳이 어긋나면 에러 없이 "포커스가 안 움직임"으로만 드러나므로 손으로 조립하지 않는다.
 * 커버리지는 `cardSearch.domContract.test.tsx`가 기계로 강제한다.
 */
export function writeBackSections(sections: AnySection[], targets: SearchTarget[]): AnySection[] {
  const byPath = new Map(targets.map((t) => [t.path, t.text]))
  const pick = (path: string, current: string) => byPath.get(path) ?? current

  return sections.map((section) => {
    const at = (...parts: string[]) => sectionPath(section.id, ...parts)
    switch (section.type) {
      case 'code':
        return { ...section, code: pick(at('code'), section.code) }
      case 'markdown':
        return { ...section, text: pick(at('text'), section.text) }
      case 'credentials':
        return {
          ...section,
          items: section.items.map((item) => {
            const f = (key: string, current: string) => pick(at('item', item.id, key), current)
            return {
              ...item,
              label: f('label', item.label),
              host: f('host', item.host),
              port: f('port', item.port),
              username: f('username', item.username),
              // database 위젯은 category==='database'일 때만 렌더된다(CredentialSectionView).
              // 평탄화의 제외 조건과 **같은 기준**으로 막아야 한다 — 한쪽만 걸면 화면에 없는 값이
              // 바꾸기로 조용히 변경된다(카테고리를 바꾼 뒤 값이 데이터에 남아 있는 경우).
              database: item.category === 'database' && item.database !== undefined
                ? f('database', item.database)
                : item.database,
              extra: f('extra', item.extra),
              // password는 타깃이 아니므로 건드리지 않는다
            }
          }),
        }
      case 'env':
        return {
          ...section,
          pairs: section.pairs.map((pair) => ({
            ...pair,
            key: pick(at('pair', pair.id, 'key'), pair.key),
            value: pair.secret ? pair.value : pick(at('pair', pair.id, 'value'), pair.value),
          })),
        }
      case 'urls':
        return {
          ...section,
          items: section.items.map((item) => {
            const f = (current: string, ...key: string[]) => pick(at('item', item.id, ...key), current)
            return {
              ...item,
              label: f(item.label, 'label'),
              url: f(item.url, 'url'),
              method: item.method === undefined ? undefined : f(item.method, 'method'),
              note: f(item.note, 'note'),
              noteCards: item.noteCards?.map((card) => ({
                ...card,
                title: f(card.title, 'note', card.id, 'title'),
                text: f(card.text, 'note', card.id, 'text'),
              })),
            }
          }),
        }
      default:
        return section
    }
  })
}

/** 섹션 하나를 펼친 새 배열을 만든다 — 접힌 섹션의 매치로 이동할 때 필요 */
export function expandSection(sections: AnySection[], sectionId: string): AnySection[] {
  return sections.map((s) => (s.id === sectionId && s.collapsed ? { ...s, collapsed: false } : s))
}

export function flattenCard(input: FlattenInput): SearchTarget[] {
  const targets: SearchTarget[] = []
  const push = (path: string, text: string, widget: SearchWidget, sectionId?: string, collapsed?: boolean) => {
    if (!text) return
    targets.push({ path, text, widget, ...(sectionId ? { sectionId, collapsed } : {}) })
  }

  for (const section of input.sections ?? []) {
    const at = (...parts: string[]) => sectionPath(section.id, ...parts)
    const inSection = (path: string, text: string, widget: SearchWidget) =>
      push(path, text, widget, section.id, section.collapsed)

    switch (section.type) {
      case 'code':
        inSection(at('code'), section.code, 'cm')
        break
      case 'markdown':
        inSection(at('text'), section.text, 'textarea')
        break
      case 'credentials':
        for (const item of section.items) {
          const f = (key: string, value: string) => inSection(at('item', item.id, key), value, 'input')
          f('label', item.label)
          f('host', item.host)
          f('port', item.port)
          f('username', item.username)
          // category가 database가 아니면 화면에 위젯이 없다 — 도달 불가 타깃을 만들지 않는다
          // (method Badge·마스킹 필드와 같은 원칙). 카테고리를 바꿔도 값은 데이터에 남는다.
          if (item.category === 'database') f('database', item.database ?? '')
          f('extra', item.extra)
          // password 제외
        }
        break
      case 'env':
        for (const pair of section.pairs) {
          inSection(at('pair', pair.id, 'key'), pair.key, 'input')
          if (!pair.secret) inSection(at('pair', pair.id, 'value'), pair.value, 'input')
        }
        break
      case 'urls':
        for (const item of section.items) {
          const f = (value: string, widget: SearchWidget, ...key: string[]) =>
            inSection(at('item', item.id, ...key), value, widget)
          f(item.label, 'input', 'label')
          f(item.url, 'input', 'url')
          // method는 편집 위젯이 없다(Badge 표시 전용, Smart Paste만 값을 넣는다).
          // 타깃으로 넣으면 카운터에는 잡히는데 이동도 포커스도 불가능한 매치가 생기므로 뺀다 —
          // 마스킹 필드를 평탄화에서 배제한 것과 같은 원칙이다.
          f(item.note, 'textarea', 'note')
          for (const card of item.noteCards ?? []) {
            f(card.title, 'input', 'note', card.id, 'title')
            f(card.text, 'textarea', 'note', card.id, 'text')
          }
        }
        break
    }
  }

  for (const [key, value] of Object.entries(input.fields ?? {})) {
    const type = input.fieldTypes?.[key]
    if (isMaskedFieldType(type)) continue
    push(fieldPath(key), value, type === 'multiline' ? 'cm' : 'input')
  }

  return targets
}
