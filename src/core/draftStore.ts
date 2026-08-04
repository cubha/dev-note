// src/core/draftStore.ts
//
// drafts 테이블 IO 래퍼 — 순수 로직(core/draft.ts)과 Dexie 접근을 분리

import { db } from './db'
import type { DraftRow, ItemType } from './db'
import { serializeDraftBody } from './draft'
import type { DraftBody } from './draft'

/** 드래프트 기록/갱신 (upsert) */
export async function saveDraft(
  itemId: number,
  fields: { title: string; type: ItemType; tags: string; body: DraftBody },
): Promise<void> {
  const row: DraftRow = {
    itemId,
    title: fields.title,
    type: fields.type,
    tags: fields.tags,
    body: serializeDraftBody(fields.body),
    updatedAt: Date.now(),
  }
  await db.drafts.put(row)
}

/** 드래프트 단건 삭제 */
export async function deleteDraft(itemId: number): Promise<void> {
  await db.drafts.delete(itemId)
}

/** 드래프트 여러 건 일괄 삭제 */
export async function deleteDrafts(itemIds: number[]): Promise<void> {
  if (itemIds.length === 0) return
  await db.drafts.bulkDelete(itemIds)
}

/** 드래프트 단건 조회 */
export async function loadDraft(itemId: number): Promise<DraftRow | undefined> {
  return db.drafts.get(itemId)
}

/** 현재 드래프트가 존재하는 모든 itemId (세션 복원·GC·dirty 동기화용) */
export async function listDraftItemIds(): Promise<number[]> {
  return db.drafts.toCollection().primaryKeys()
}
