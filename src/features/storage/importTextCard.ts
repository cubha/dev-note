// src/features/storage/importTextCard.ts
//
// 텍스트 파일(txt/md) → 카드 DB 쓰기 계층. importCard.ts(순수 변환)의 출력을
// publishItem 경유로 발행한다 — 카드 발행 단일 관문(CardFormModal/CardDetailEditor/
// draftCommit.ts와 동일 규약)을 지킨다.
//
// 쓰기 순서(불변식): encryptionEnabled && encryptionKey일 때 평문이 db.items에
// 단 1바이트도 닿지 않는다 — CardFormModal.tsx의 "직렬화→암호화→add" 순서를 그대로
// 따른다. add 이후에 암호화하면 크래시/탭종료/encrypt 중 throw 시 평문 row가
// durable하게 남는 유출 경로가 생긴다.

import { db } from '../../core/db'
import { buildImportedCard } from '../../core/importCard'
import { serializeContent, encryptContent } from '../../core/content'
import { encryptTags } from '../../core/metaCrypto'
import { publishItem } from '../../core/publishItem'

export interface TextFileInput {
  name: string
  text: string
}

export interface ImportTextCardsSummary {
  created: Array<{ itemId: number; title: string }>
  locked: number
}

/**
 * 파일들을 순차(for...of + await)로 처리한다. publishItem은 호출 시점에
 * db.items.toArray()로 제목 충돌 집합(taken)을 스냅샷 뜬다 — Promise.all로
 * 병렬 호출하면 전부 같은 스냅샷을 보고 동일 제목이 중복 생성된다(넘버링 붕괴).
 */
export async function importTextFilesAsCards(
  inputs: TextFileInput[],
  folderId: number | null,
  encryptionEnabled: boolean,
  encryptionKey: CryptoKey | null,
): Promise<ImportTextCardsSummary> {
  const created: Array<{ itemId: number; title: string }> = []
  let locked = 0

  for (const input of inputs) {
    if (encryptionEnabled && !encryptionKey) {
      locked++
      continue
    }

    const draft = buildImportedCard(input.name, input.text)
    let content = serializeContent(draft.contentObj)
    let tags: string[] = []
    if (encryptionEnabled && encryptionKey) {
      content = await encryptContent(content, encryptionKey)
      tags = await encryptTags(tags, encryptionKey)
    }

    const now = Date.now()
    const newId = await db.items.add({
      folderId,
      title: draft.title,
      type: draft.type,
      tags,
      order: now,
      pinned: false,
      content,
      updatedAt: now,
      createdAt: now,
      draft: true,
    })

    const { finalTitle } = await publishItem(newId, {
      title: draft.title, type: draft.type, tags, content, updatedAt: now,
    })

    created.push({ itemId: newId, title: finalTitle })
  }

  return { created, locked }
}
