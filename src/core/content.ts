import type { CardContent, StructuredContent, CardField } from './types'
import { FIELD_SCHEMAS } from './types'
import type { ItemType } from './db'

/**
 * 복호화된 텍스트를 CardContent로 파싱한다.
 * - structured format JSON → StructuredContent
 * - 그 외 (레거시 텍스트) → LegacyContent
 */
export function parseContent(decryptedText: string | null): CardContent {
  if (!decryptedText || decryptedText.trim() === '') {
    return { format: 'legacy', text: '' }
  }

  try {
    const parsed: unknown = JSON.parse(decryptedText)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'format' in parsed &&
      (parsed as Record<string, unknown>).format === 'structured' &&
      'fields' in parsed &&
      Array.isArray((parsed as Record<string, unknown>).fields)
    ) {
      return parsed as StructuredContent
    }
  } catch {
    // JSON 파싱 실패 → 레거시 텍스트
  }

  return { format: 'legacy', text: decryptedText }
}

/**
 * StructuredContent를 저장용 JSON 문자열로 직렬화한다.
 */
export function serializeContent(content: StructuredContent): string {
  return JSON.stringify(content)
}

/**
 * 타입별 기본 필드로 빈 StructuredContent를 생성한다.
 */
export function createEmptyStructuredContent(type: ItemType): StructuredContent {
  const schemas = FIELD_SCHEMAS[type]
  const fields: CardField[] = schemas.map((schema) => ({
    key: schema.key,
    label: schema.label,
    value: '',
    type: schema.type,
  }))
  return { format: 'structured', fields }
}

/**
 * CardContent에서 검색용 평문 텍스트를 추출한다.
 * (Fuse.js 검색 인덱싱에 사용)
 */
export function extractSearchText(content: CardContent): string {
  if (content.format === 'legacy') {
    return content.text
  }
  return content.fields
    .filter((f) => f.type !== 'password')
    .map((f) => `${f.label}: ${f.value}`)
    .join(' ')
}

/**
 * StructuredContent의 특정 필드 값을 가져온다.
 */
export function getFieldValue(content: CardContent, key: string): string {
  if (content.format !== 'structured') return ''
  const field = content.fields.find((f) => f.key === key)
  return field?.value ?? ''
}
