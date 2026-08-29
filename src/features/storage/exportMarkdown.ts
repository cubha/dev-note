// src/features/storage/exportMarkdown.ts
//
// 다중 카드 md 일괄 내보내기(F3). 사용자 확정: 진입점=사이드바 다중선택 액션바,
// FSAA 미지원(Firefox/Safari) 폴백=단일 연결 .md(zip 등 신규 의존성 도입 안 함).

import { db } from '../../core/db'
import type { Item } from '../../core/db'
import { isEncryptedContent, decryptContent, parseContent } from '../../core/content'
import { isDraft } from '../../core/cardState'
import { cardToMarkdown } from '../../core/cardMarkdown'
import { sanitizeFilename } from '../../core/naming'
import { DEFAULT_ITEM_TITLE } from '../../shared/constants'
import { saveTextFile } from './fileSave'

type FSAADirWindow = Window & {
  showDirectoryPicker: (opts?: { startIn?: string }) => Promise<{
    getFileHandle: (name: string, opts?: { create?: boolean }) => Promise<{
      createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>
    }>
  }>
}

export interface ExportMarkdownResult {
  exported: number
  skippedLocked: number
}

/** 단일 카드 저장 결과. 'locked'는 암호화된 카드를 키 없이 내보내려 한 경우(평문 파일이라 거부). */
export type ExportItemMarkdownResult =
  | { status: 'saved'; fileName: string }
  | { status: 'locked' }
  | { status: 'cancelled' }

/**
 * 카드 1건을 md로 저장한다. 진입점이 여러 곳(카드 상세 `.md` 버튼 · 탭 우클릭 메뉴 ·
 * 카드 ⋯ 메뉴)이라 렌더·파일명·잠금 규칙을 여기 한 곳에 둔다 — 진입점마다 복제하면
 * "어디서 저장했느냐에 따라 결과가 다른" 회귀가 생긴다.
 * 저장 기준은 **DB에 저장된 content**다(미저장 편집분은 반영되지 않음 — F3 확정 설계).
 */
export async function exportItemAsMarkdown(
  item: Item,
  encryptionKey: CryptoKey | null,
): Promise<ExportItemMarkdownResult> {
  if (isEncryptedContent(item.content) && !encryptionKey) return { status: 'locked' }

  let rawContent = item.content
  if (isEncryptedContent(rawContent)) {
    rawContent = await decryptContent(rawContent, encryptionKey!)
  }
  const md = cardToMarkdown(item, parseContent(rawContent))
  const fileName = `${sanitizeFilename(item.title || DEFAULT_ITEM_TITLE)}.md`

  try {
    await saveTextFile({
      content: md,
      fileName,
      mimeType: 'text/markdown',
      description: 'Markdown',
      extension: '.md',
    })
  } catch (e) {
    // FSAA 저장 피커 취소(AbortError)만 "실패 아님"으로 삼킨다. 디스크 쓰기 실패·권한 거부까지
    // 취소로 뭉개면 저장이 안 됐는데 아무 표시가 없는 조용한 실패가 된다 → 호출부로 던진다.
    if (e instanceof DOMException && e.name === 'AbortError') return { status: 'cancelled' }
    throw e
  }
  return { status: 'saved', fileName }
}

function formatDateForFilename(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/**
 * 선택한 카드들을 md로 내보낸다. draft(미저장 새 카드)는 건너뛴다(목록에도 없는 카드라
 * 선택 UI로는 애초에 고를 수 없지만 방어적으로 재확인). 잠긴(암호화된) 카드도 건너뛰고
 * 개수를 알려준다 — 평문 파일이라 암호화된 채로는 내보낼 수 없다.
 */
export async function exportSelectedAsMarkdown(
  itemIds: number[],
  encryptionKey: CryptoKey | null,
): Promise<ExportMarkdownResult> {
  const rows = await db.items.bulkGet(itemIds)
  const items = rows.filter((i): i is Item => i !== undefined && !isDraft(i))

  let skippedLocked = 0
  const rendered: Array<{ item: Item; md: string }> = []
  for (const item of items) {
    if (isEncryptedContent(item.content) && !encryptionKey) {
      skippedLocked++
      continue
    }
    let rawContent = item.content
    if (isEncryptedContent(rawContent)) {
      rawContent = await decryptContent(rawContent, encryptionKey!)
    }
    rendered.push({ item, md: cardToMarkdown(item, parseContent(rawContent)) })
  }

  if (rendered.length === 0) return { exported: 0, skippedLocked }

  if ('showDirectoryPicker' in window) {
    // FSAA 지원 — 카드별 개별 파일. 파일명 충돌은 uniquifyTitle과 동일한 넘버링 규칙.
    const dir = await (window as FSAADirWindow).showDirectoryPicker({ startIn: 'downloads' })
    const usedNames = new Set<string>()
    for (const { item, md } of rendered) {
      const base = sanitizeFilename(item.title || '제목없음')
      let filename = `${base}.md`
      let n = 1
      while (usedNames.has(filename)) {
        filename = `${base} (${n}).md`
        n++
      }
      usedNames.add(filename)
      const handle = await dir.getFileHandle(filename, { create: true })
      const writable = await handle.createWritable()
      await writable.write(md)
      await writable.close()
    }
  } else {
    // FSAA 미지원 — 단일 연결 .md(카드마다 `---` 구분)
    const combined = rendered.map(({ md }) => md).join('\n\n---\n\n')
    await saveTextFile({
      content: combined,
      fileName: `devnote-export-${rendered.length}건-${formatDateForFilename(Date.now())}.md`,
      mimeType: 'text/markdown',
      description: 'Markdown',
      extension: '.md',
    })
  }

  return { exported: rendered.length, skippedLocked }
}
