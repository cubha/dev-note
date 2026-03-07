import type { CardContent as CardContentType } from '../../core/types'
import { FieldRow } from './FieldRow'

interface CardContentProps {
  content: CardContentType
}

export function CardContentView({ content }: CardContentProps) {
  if (content.format === 'legacy') {
    return (
      <div className="px-4 pb-4">
        <pre className="font-mono text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-all leading-relaxed m-0 max-h-48 overflow-y-auto">
          {content.text || '(빈 내용)'}
        </pre>
      </div>
    )
  }

  const nonEmptyFields = content.fields.filter((f) => f.value)

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
        />
      ))}
    </div>
  )
}
