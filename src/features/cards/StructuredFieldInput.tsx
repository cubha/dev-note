import { Copy, ExternalLink, ChevronDown } from 'lucide-react'
import type { CardField, FieldSchema } from '../../core/types'
import { Input } from '../../shared/components/Input'
import { TextArea } from '../../shared/components/TextArea'
import { FIELD_SCHEMAS } from '../../core/types'
import type { ItemType } from '../../core/db'
import { copyToClipboard } from '../../shared/utils/clipboard'
import { openUrl } from '../../shared/utils/url'
import { EDITOR_FIELD_KEYS } from './fieldHelpers'
import { usePasswordReveal } from '../../shared/hooks/usePasswordReveal'

// ── 구조화 필드 폼 ──────────────────────────────────────

interface StructuredFieldFormProps {
  fields: CardField[]
  type: ItemType
  onFieldChange: (key: string, value: string) => void
}

export const StructuredFieldForm = ({ fields, type, onFieldChange }: StructuredFieldFormProps) => {
  const schemas = FIELD_SCHEMAS[type]
  const formSchemas = schemas.filter(s => !EDITOR_FIELD_KEYS.has(s.key))

  if (formSchemas.length === 0) return null

  return (
    <div className="space-y-2.5 px-6 py-4">
      {formSchemas.map(schema => {
        const field = fields.find(f => f.key === schema.key)
        const value = field?.value ?? ''
        return (
          <FieldInput
            key={schema.key}
            schema={schema}
            value={value}
            onChange={(val) => onFieldChange(schema.key, val)}
          />
        )
      })}
    </div>
  )
}

// ── 개별 필드 입력 ──────────────────────────────────────

const FieldInput = ({ schema, value, onChange }: {
  schema: FieldSchema
  value: string
  onChange: (value: string) => void
}) => {
  const { toggle, inputType, Icon, ariaLabel } = usePasswordReveal()

  const isPassword = schema.type === 'password'
  const isUrl = schema.type === 'url' || schema.type === 'email'
  const isMultiline = schema.type === 'multiline'
  const hasOptions = schema.options && schema.options.length > 0

  return (
    <div className="group flex items-start gap-3">
      <label className="w-24 shrink-0 label-text pt-2.5 text-right">
        {schema.label}
      </label>

      <div className="flex flex-1 items-start gap-1.5 min-w-0">
        {hasOptions ? (
          <DropdownSelect
            value={value}
            options={schema.options!}
            placeholder={schema.placeholder}
            onChange={onChange}
          />
        ) : isMultiline ? (
          <TextArea
            autoResize
            value={value}
            placeholder={schema.placeholder}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="flex-1 font-mono leading-relaxed"
          />
        ) : (
          <Input
            type={isPassword ? inputType : schema.type === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={schema.placeholder}
            className="flex-1 font-mono"
          />
        )}

        {/* 액션 버튼 */}
        <div className="flex shrink-0 items-center gap-0.5 pt-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {isPassword && (
            <button
              type="button"
              onClick={toggle}
              className="subtle-btn rounded p-1.5 hover:bg-[var(--bg-surface-hover)]"
              aria-label={ariaLabel}
            >
              <Icon size={14} />
            </button>
          )}

          {isUrl && value && (
            <button
              type="button"
              onClick={() => openUrl(value)}
              className="rounded p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-active)] cursor-pointer bg-transparent border-none"
              aria-label="URL 열기"
            >
              <ExternalLink size={14} />
            </button>
          )}

          {value && (
            <button
              type="button"
              onClick={() => void copyToClipboard(value, schema.label)}
              className="subtle-btn rounded p-1.5 hover:bg-[var(--bg-surface-hover)]"
              aria-label={`${schema.label} 복사`}
            >
              <Copy size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 드롭다운 셀렉트 ────────────────────────────────────

const DropdownSelect = ({ value, options, placeholder, onChange }: {
  value: string
  options: string[]
  placeholder?: string
  onChange: (value: string) => void
}) => {
  return (
    <div className="relative flex-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 pr-8 text-sm font-mono text-[var(--text-primary)] focus:border-[var(--border-accent)] focus:outline-none transition-colors cursor-pointer"
      >
        {!value && <option value="">{placeholder || '선택...'}</option>}
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
      />
    </div>
  )
}

