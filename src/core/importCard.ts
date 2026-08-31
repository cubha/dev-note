// src/core/importCard.ts
//
// txt/md 파일 → 카드 초안 순수 변환기. cardMarkdown.ts(내보내기)의 역방향 대칭.
// DevNote 자체 md 포맷(cardToMarkdown)의 역파싱은 하지 않는다 — 파일 전문을
// markdown 섹션 텍스트 1개로 담는다(왕복은 설계상 lossy, 비목표로 확정).

import type { ItemType } from './db'
import type { HybridContent, MarkdownSection } from './types'
import { createEmptyHybridContent } from './content'

export const TEXT_IMPORT_EXTENSIONS = ['.txt', '.md'] as const
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024

export type ImportFileKind = 'text' | 'json' | 'unsupported'

export interface ImportedCardDraft {
  title: string
  type: ItemType
  contentObj: HybridContent
}

const TEXT_EXTENSION_SET = new Set<string>(TEXT_IMPORT_EXTENSIONS)

function lastExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase()
}

export function classifyImportFile(fileName: string): ImportFileKind {
  const ext = lastExtension(fileName)
  if (TEXT_EXTENSION_SET.has(ext)) return 'text'
  if (ext === '.json') return 'json'
  return 'unsupported'
}

// Windows 메모장 등에서 저장된 파일 대응 — BOM 제거, CRLF/CR을 LF로 통일하지 않으면
// CodeMirror·marked 렌더가 어긋난다. BOM 리터럴 대신 \uFEFF 이스케이프로 쓴다
// (리터럴 문자는 eslint no-irregular-whitespace에 걸린다).
function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

function extractTitle(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const base = dot === -1 ? fileName : fileName.slice(0, dot)
  return base.trim()
}

export function buildImportedCard(fileName: string, text: string): ImportedCardDraft {
  const contentObj = createEmptyHybridContent()
  // createEmptyHybridContent()는 sections[0]을 markdown 섹션 1개로 만든다(core/content.ts) —
  // 타입은 AnySection[]으로 넓혀져 있어 이 자리에서만 좁혀 쓴다.
  const section = contentObj.sections[0] as MarkdownSection
  section.text = normalizeText(text)
  return {
    title: extractTitle(fileName),
    type: 'document',
    contentObj,
  }
}
