// src/core/draftStore.ts
//
// drafts 테이블 IO 래퍼 — 순수 로직(core/draft.ts)과 Dexie 접근을 분리

import { db } from './db'
import type { DraftRow, ItemType } from './db'
import { serializeDraftBody, parseDraftBody } from './draft'
import type { DraftBody } from './draft'
import { isEncryptedContent, encryptContent, decryptContent } from './content'

/**
 * 이미 직렬화(및 필요 시 암호화까지 완료)된 body 문자열을 그대로 기록하는 저수준 IO.
 * flushDraftNow처럼 "encrypt 완료 후 epoch 재검증 뒤 쓰기"가 필요한 호출부용 —
 * saveDraft는 encrypt+put을 한 번에 묶어 이 재검증 지점을 낼 수 없다.
 */
export async function saveDraftRaw(
  itemId: number,
  fields: { title: string; type: ItemType; tags: string; bodyStr: string; baseUpdatedAt: number },
): Promise<void> {
  const row: DraftRow = {
    itemId,
    title: fields.title,
    type: fields.type,
    tags: fields.tags,
    body: fields.bodyStr,
    baseUpdatedAt: fields.baseUpdatedAt,
    updatedAt: Date.now(),
  }
  await db.drafts.put(row)
}

/** 드래프트 기록/갱신 (upsert). encryptionKey가 있으면 body를 암호화해서 저장한다. */
export async function saveDraft(
  itemId: number,
  fields: { title: string; type: ItemType; tags: string; body: DraftBody; baseUpdatedAt: number },
  encryptionKey?: CryptoKey | null,
): Promise<void> {
  let bodyStr = serializeDraftBody(fields.body)
  if (encryptionKey) {
    bodyStr = await encryptContent(bodyStr, encryptionKey)
  }
  await saveDraftRaw(itemId, {
    title: fields.title, type: fields.type, tags: fields.tags, bodyStr, baseUpdatedAt: fields.baseUpdatedAt,
  })
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

/** 드래프트 읽기 결과 — 잠긴 상태와 손상 상태를 구분해, 잠긴 드래프트를 손상으로 오인해 삭제하지 않기 위함 */
export type DraftReadResult =
  | { status: 'none' }
  | { status: 'locked' }
  | { status: 'corrupt' }
  | { status: 'ok'; draft: DraftRow; body: DraftBody }

/** 드래프트를 읽고 필요 시 복호화·파싱까지 수행한다. */
export async function readDraft(itemId: number, encryptionKey: CryptoKey | null): Promise<DraftReadResult> {
  const draft = await loadDraft(itemId)
  if (!draft) return { status: 'none' }

  let bodyStr = draft.body
  if (isEncryptedContent(bodyStr)) {
    if (!encryptionKey) return { status: 'locked' }
    try {
      bodyStr = await decryptContent(bodyStr, encryptionKey)
    } catch {
      return { status: 'corrupt' } // 잘못된 키 등으로 복호화 실패
    }
  }

  const body = parseDraftBody(bodyStr)
  if (!body) return { status: 'corrupt' }
  return { status: 'ok', draft, body }
}
