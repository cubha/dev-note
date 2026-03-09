import type { CardContent as CardContentType } from '../../core/types'
import { FieldRow } from './FieldRow'

interface CardContentProps {
  content: CardContentType
  excludeMultiline?: boolean
  searchQuery?: string
}

export function CardContentView({ content, excludeMultiline, searchQuery = '' }: CardContentProps) {
  if (content.format === 'legacy') {
    return (
      <div className="px-4 pb-4">
        <p className="font-mono text-sm text-[var(--text-secondary)] truncate m-0">
          {content.text || '(빈 내용)'}
        </p>
      </div>
    )
  }

  // HybridContent는 별도 렌더러 사용 (여기서는 미지원 — 간략 표시)
  if (content.format === 'hybrid') {
    return (
      <div className="px-4 pb-4">
        <p className="text-sm text-[var(--text-tertiary)] italic m-0">
          {content.sections.length}개 섹션
        </p>
      </div>
    )
  }

  let nonEmptyFields = content.fields.filter((f) => f.value)
  if (excludeMultiline) {
    nonEmptyFields = nonEmptyFields.filter((f) => f.type !== 'multiline')
  }

  if (nonEmptyFields.length === 0) {
    return (
      <div className="px-4 pb-4">
        <p className="text-sm text-[var(--text-tertiary)] italic">필드가 비어 있습니다</p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-3">
      {nonEmptyFields.map((field) => (
        <FieldRow
          key={field.key}
          label={field.label}
          value={field.value}
          type={field.type}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  )
}
