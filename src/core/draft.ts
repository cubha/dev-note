// src/core/draft.ts
//
// 탭 드래프트(미저장 편집분) 순수 로직 — payload 직렬화/파싱 + 세션 복원 판정
// IndexedDB IO는 draftStore.ts, UI 통합은 각 에디터 컴포넌트에서 담당

import type { AnySection } from './types'
import { isEncryptedContent } from './content'

/** 정형 필드 카드(server/db/api/note)의 드래프트 본문 */
export interface FieldsDraftBody {
  kind: 'fields'
  fields: [string, string][]
  editorText: string
}

/** document 타입 카드의 드래프트 본문 */
export interface DocumentDraftBody {
  kind: 'document'
  sections: AnySection[]
}

export type DraftBody = FieldsDraftBody | DocumentDraftBody

/**
 * 드래프트를 디스크(IndexedDB)에 영속해도 되는 카드인지 판정.
 * 암호화된 content는 이번 범위에서 제외(별도 작업) — 평문 노출 방지.
 */
export function isDraftPersistable(item: { content: string }): boolean {
  return !isEncryptedContent(item.content)
}

/** DraftBody를 저장용 JSON 문자열로 직렬화 */
export function serializeDraftBody(body: DraftBody): string {
  return JSON.stringify(body)
}

const isFieldPair = (f: unknown): f is [string, string] =>
  Array.isArray(f) && f.length === 2 && typeof f[0] === 'string' && typeof f[1] === 'string'

/** 저장된 JSON 문자열을 DraftBody로 파싱. 형식이 어긋나면 null(손상 드래프트 방어) */
export function parseDraftBody(text: string): DraftBody | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>

  if (obj.kind === 'fields' && Array.isArray(obj.fields) && typeof obj.editorText === 'string') {
    if (!obj.fields.every(isFieldPair)) return null
    return { kind: 'fields', fields: obj.fields as [string, string][], editorText: obj.editorText }
  }

  if (obj.kind === 'document' && Array.isArray(obj.sections)) {
    return { kind: 'document', sections: obj.sections as AnySection[] }
  }

  return null
}

/** 현존하지 않는 아이템을 가리키는 고아 드래프트 id 목록(GC용) */
export function orphanDraftIds(draftItemIds: number[], liveItemIds: Set<number>): number[] {
  return draftItemIds.filter((id) => !liveItemIds.has(id))
}

/** 복원 대상 탭 목록에서 삭제된 아이템의 탭을 제외 */
export function filterRestorableTabs(openTabIds: number[], liveItemIds: Set<number>): number[] {
  return openTabIds.filter((id) => liveItemIds.has(id))
}

/** 복원 목록에 없는 드래프트 보유 탭을 순서 뒤에 강제 추가(중복 없이) */
export function mergeDraftTabs(restoredTabs: number[], draftItemIds: number[]): number[] {
  const result = [...restoredTabs]
  for (const id of draftItemIds) {
    if (!result.includes(id)) result.push(id)
  }
  return result
}
