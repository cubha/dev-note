// src/features/cards/draftCommit.ts
//
// 드래프트를 컴포넌트 상태와 무관하게 아이템에 커밋한다 — 닫기 confirm의 "저장"이
// 백그라운드(비활성) 탭에도 동일하게 동작하도록, CardDetailEditor/DocumentEditor가
// 마운트되어 있지 않아도 drafts 테이블 값만으로 완결되게 만든다.

import { db } from '../../core/db'
import { loadDraft, deleteDraft } from '../../core/draftStore'
import { parseDraftBody } from '../../core/draft'
import { FIELD_SCHEMAS } from '../../core/types'
import type { CardField, StructuredContent, HybridContent } from '../../core/types'
import { serializeContent, encryptContent } from '../../core/content'
import { getEditorFieldKey } from './fieldHelpers'

/**
 * itemId의 드래프트를 읽어 items에 커밋(저장)하고 드래프트를 삭제한다.
 * 드래프트가 없거나 손상됐으면(파싱 실패) 조용히 정리만 하고 종료한다.
 *
 * 호출 계약: 진짜 백그라운드(비활성) 탭에만 쓴다. 활성 탭(마운트된 CardDetailEditor가
 * 보고 있는 탭)에는 draftFlushControl의 saveIfActive()를 먼저 시도해야 한다 — 이 함수는
 * 컴포넌트의 dirtyRef를 모르므로, 활성 탭에 쓰면 커밋 직후에도 디바운스 effect가 dirty를
 * true로 계속 보고 방금 지운 드래프트를 되살리는 레이스가 생긴다(scope-critic 지적).
 */
export async function commitDraftToItem(
  itemId: number,
  encryptionEnabled: boolean,
  encryptionKey: CryptoKey | null,
): Promise<void> {
  const draft = await loadDraft(itemId)
  if (!draft) return

  const item = await db.items.get(itemId)
  if (!item) {
    await deleteDraft(itemId)
    return
  }

  const body = parseDraftBody(draft.body)
  if (!body) {
    await deleteDraft(itemId)
    return
  }

  // 볼트가 켜져 있는데 잠긴 상태(키 없음)면 커밋을 거부한다 — 조건이 그냥 false가 되어
  // 평문으로 조용히 저장되는 걸 막는다. handleSave(활성 탭)는 로더가 키 없으면 아이템을
  // 아예 못 불러와 dirty가 성립하지 않아 이 경로에 도달 못 하지만, commitDraftToItem은
  // 컴포넌트 상태와 무관하게 독립 실행되므로 동일 가드가 없으면 zero-knowledge 원칙이
  // 깨진다(security-auditor 지적).
  if (encryptionEnabled && !encryptionKey) {
    throw new Error('암호화가 잠긴 상태입니다. 잠금을 해제한 뒤 다시 시도해 주세요.')
  }

  const parsedTags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean)

  let content: string
  if (body.kind === 'document') {
    const hybrid: HybridContent = { format: 'hybrid', sections: body.sections }
    content = serializeContent(hybrid)
  } else {
    const schemas = FIELD_SCHEMAS[draft.type]
    const editorKey = getEditorFieldKey(draft.type)
    const fieldMap = new Map(body.fields)
    const allFields: CardField[] = schemas.map((schema) => ({
      key: schema.key,
      label: schema.label,
      value: editorKey && schema.key === editorKey ? body.editorText : (fieldMap.get(schema.key) ?? ''),
      type: schema.type,
    }))
    const structured: StructuredContent = { format: 'structured', fields: allFields }
    content = serializeContent(structured)
  }

  if (encryptionEnabled && encryptionKey) {
    content = await encryptContent(content, encryptionKey)
  }

  await db.items.update(itemId, {
    title: draft.title, type: draft.type, tags: parsedTags,
    content, updatedAt: Date.now(),
  })
  await deleteDraft(itemId)
}
