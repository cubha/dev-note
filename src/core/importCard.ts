// src/core/importCard.ts
//
// txt/md 파일 → 카드 초안 순수 변환기. cardMarkdown.ts(내보내기)의 역방향 대칭.
// DevNote 자체 md 포맷(cardToMarkdown)의 역파싱은 하지 않는다 — 파일 전문을 note 카드의
// 단일 필드에 그대로 담는다(왕복은 설계상 lossy, 비목표로 확정).
//
// 타입 = note (document 아님). document는 섹션 UI(추가/collapse/붙여넣기 버튼)가 붙어
// 단순 텍스트 파일 하나 가져온 것치고 화면이 무겁다 — note는 필드가 하나뿐이라
// 에디터 하나만 뜬다. multiline 필드를 내보낼 때 개행이 있는 값을 불릿 한 줄에
// 욱여넣으면 마크다운이 깨지던 문제는 cardMarkdown.ts에서 별도로 고쳤다(왕복 안전).
import type { ItemType } from './db'
import type { StructuredContent } from './types'
import { createEmptyStructuredContent } from './content'

export const TEXT_IMPORT_EXTENSIONS = ['.txt', '.md'] as const
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024

export type ImportFileKind = 'text' | 'json' | 'unsupported'

export interface ImportedCardDraft {
  title: string
  type: ItemType
  contentObj: StructuredContent
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
  const contentObj = createEmptyStructuredContent('note')
  // FIELD_SCHEMAS.note는 필드가 'content' 하나뿐이다(core/types.ts) — 그 자리에 원문을 채운다.
  contentObj.fields[0].value = normalizeText(text)
  return {
    title: extractTitle(fileName),
    type: 'note',
    contentObj,
  }
}
