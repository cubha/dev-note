import type { CardContent, StructuredContent, HybridContent, CardField, AnySection } from './types'
import { FIELD_SCHEMAS } from './types'
import type { ItemType } from './db'
import { nanoid } from 'nanoid'

/**
 * 텍스트를 CardContent로 파싱한다.
 * - format: 'hybrid'  → HybridContent
 * - format: 'structured' → StructuredContent
 * - 그 외 (레거시 텍스트) → LegacyContent
 */
export function parseContent(text: string | null): CardContent {
  if (!text || text.trim() === '') {
    return { format: 'legacy', text: '' }
  }

  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) {
      return { format: 'legacy', text }
    }

    const obj = parsed as Record<string, unknown>

    // HybridContent 감지
    if (obj.format === 'hybrid' && Array.isArray(obj.sections)) {
      return parsed as HybridContent
    }

    // StructuredContent 감지
    if (obj.format === 'structured' && Array.isArray(obj.fields)) {
      return parsed as StructuredContent
    }
  } catch {
    // JSON 파싱 실패 → 레거시 텍스트
  }

  return { format: 'legacy', text }
}

/**
 * CardContent를 저장용 JSON 문자열로 직렬화한다.
 */
export function serializeContent(content: StructuredContent | HybridContent): string {
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
 * 빈 HybridContent를 생성한다 (document 타입 기본값).
 * 기본 마크다운 섹션 1개 포함.
 */
export function createEmptyHybridContent(): HybridContent {
  return {
    format: 'hybrid',
    sections: [
      {
        id: nanoid(12),
        type: 'markdown',
        title: '메모',
        collapsed: false,
        text: '',
      },
    ],
  }
}

/**
 * CardContent에서 검색용 평문 텍스트를 추출한다.
 * (Fuse.js 검색 인덱싱에 사용)
 */
export function extractSearchText(content: CardContent): string {
  if (content.format === 'legacy') {
    return content.text
  }

  if (content.format === 'hybrid') {
    return extractHybridSearchText(content.sections)
  }

  return content.fields
    .filter((f) => f.type !== 'password')
    .map((f) => `${f.label}: ${f.value}`)
    .join(' ')
}

/** HybridContent 섹션에서 검색용 텍스트 추출 (password 필드 제외) */
function extractHybridSearchText(sections: AnySection[]): string {
  const parts: string[] = []
  for (const section of sections) {
    if (section.title) parts.push(section.title)

    switch (section.type) {
      case 'markdown':
        if (section.text) parts.push(section.text)
        break
      case 'credentials':
        for (const item of section.items) {
          parts.push(`${item.label} ${item.host}:${item.port} ${item.username}`)
          if (item.database) parts.push(item.database)
          if (item.extra) parts.push(item.extra)
        }
        break
      case 'urls':
        for (const item of section.items) {
          parts.push(`${item.label} ${item.url}`)
          if (item.note) parts.push(item.note)
        }
        break
      case 'env':
        for (const pair of section.pairs) {
          if (!pair.secret) parts.push(`${pair.key}=${pair.value}`)
          else parts.push(pair.key)
        }
        break
      case 'code':
        parts.push(`${section.language} ${section.code}`)
        break
    }
  }
  return parts.join(' ')
}

/**
 * StructuredContent의 특정 필드 값을 가져온다.
 */
export function getFieldValue(content: CardContent, key: string): string {
  if (content.format !== 'structured') return ''
  const field = content.fields.find((f) => f.key === key)
  return field?.value ?? ''
}
