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

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 검색어를 정규식으로 만든다.
 *
 * 일반 모드는 **입력 그대로** 찾는다 — 이 앱은 `C:\temp` 같은 경로와 코드를 담는 개발 노트라,
 * 이스케이프를 해석하면 "화면에 보이는데 검색이 안 되는" 상태가 된다. 정규식 모드에서만 해석한다.
 * 잘못된 정규식은 null을 반환해 호출부가 빈 결과를 주도록 한다(입력 중 예외로 죽으면 안 된다).
 */
const buildMatcher = (query: string, o: SearchOptions): RegExp | null => {
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

export function flattenCard(input: FlattenInput): SearchTarget[] {
  const targets: SearchTarget[] = []
  const push = (path: string, text: string, widget: SearchWidget, sectionId?: string, collapsed?: boolean) => {
    if (!text) return
    targets.push({ path, text, widget, ...(sectionId ? { sectionId, collapsed } : {}) })
  }

  for (const section of input.sections ?? []) {
    const base = `sec:${section.id}`
    const at = (suffix: string) => `${base}:${suffix}`
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
          const f = (key: string, value: string) => inSection(at(`item:${item.id}:${key}`), value, 'input')
          f('label', item.label)
          f('host', item.host)
          f('port', item.port)
          f('username', item.username)
          f('database', item.database ?? '')
          f('extra', item.extra)
          // password 제외
        }
        break
      case 'env':
        for (const pair of section.pairs) {
          inSection(at(`pair:${pair.id}:key`), pair.key, 'input')
          if (!pair.secret) inSection(at(`pair:${pair.id}:value`), pair.value, 'input')
        }
        break
      case 'urls':
        for (const item of section.items) {
          const f = (key: string, value: string, widget: SearchWidget = 'input') =>
            inSection(at(`item:${item.id}:${key}`), value, widget)
          f('label', item.label)
          f('url', item.url)
          f('method', item.method ?? '')
          f('note', item.note, 'textarea')
          for (const card of item.noteCards ?? []) {
            f(`note:${card.id}:title`, card.title)
            f(`note:${card.id}:text`, card.text, 'textarea')
          }
        }
        break
    }
  }

  for (const [key, value] of Object.entries(input.fields ?? {})) {
    const type = input.fieldTypes?.[key]
    if (isMaskedFieldType(type)) continue
    push(`field:${key}`, value, type === 'multiline' ? 'cm' : 'input')
  }

  return targets
}
