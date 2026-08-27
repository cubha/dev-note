import { db } from './db'
import type { Item } from './db'
import { isDraft } from './cardState'
import { uniquifyTitle } from './naming'

export type PublishPatch = Partial<Omit<Item, 'id' | 'draft'>> & { title: string }

/**
 * draft/published 카드 저장의 단일 관문. 저장 대상이 지금 draft일 때만 uniquifyTitle을
 * 적용하고 draft 플래그를 해제한다 — 이미 published인 카드는 매 저장마다 넘버링이
 * 붙지 않도록 갱신 "전"에 draft 여부를 먼저 확인한다.
 *
 * 발행 경로 3곳(CardFormModal 최초 저장 / CardDetailEditor Ctrl+S / draftCommit.ts
 * 백그라운드 탭 저장)이 전부 이 함수를 통과해야 넘버링·draft 해제가 일관된다.
 */
export async function publishItem(itemId: number, patch: PublishPatch): Promise<{ finalTitle: string }> {
  const current = await db.items.get(itemId)
  if (!current) throw new Error(`publishItem: item ${itemId} not found`)

  const wasDraft = isDraft(current)
  let finalTitle = patch.title

  if (wasDraft) {
    const others = await db.items.toArray()
    const taken = new Set(
      others.filter((i) => i.id !== itemId && !isDraft(i)).map((i) => i.title),
    )
    finalTitle = uniquifyTitle(patch.title, taken)
  }

  await db.items.update(itemId, {
    ...patch,
    title: finalTitle,
    draft: wasDraft ? false : current.draft,
  })

  return { finalTitle }
}
