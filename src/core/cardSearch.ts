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

export function flattenCard(_input: FlattenInput): SearchTarget[] {
  return []
}
