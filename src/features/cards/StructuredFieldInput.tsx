import { useState, useRef, useEffect } from 'react'
import { Eye, EyeOff, Copy, ExternalLink, ChevronDown } from 'lucide-react'
import type { CardField, FieldSchema } from '../../core/types'
import { FIELD_SCHEMAS } from '../../core/types'
import type { ItemType } from '../../core/db'
import { copyToClipboard } from '../../shared/utils/clipboard'
import { openUrl } from '../../shared/utils/url'
import { EDITOR_FIELD_KEYS } from './fieldHelpers'

// ── 구조화 필드 폼 ──────────────────────────────────────

interface StructuredFieldFormProps {
  fields: CardField[]
  type: ItemType
  onFieldChange: (key: string, value: string) => void
}

export function StructuredFieldForm({ fields, type, onFieldChange }: StructuredFieldFormProps) {
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

function FieldInput({ schema, value, onChange }: {
  schema: FieldSchema
  value: string
  onChange: (value: string) => void
}) {
  const [revealed, setRevealed] = useState(false)

  const isPassword = schema.type === 'password'
  const isUrl = schema.type === 'url' || schema.type === 'email'
  const isMultiline = schema.type === 'multiline'
  const hasOptions = schema.options && schema.options.length > 0

  return (
    <div className="group flex items-start gap-3">
      <label className="w-24 shrink-0 text-xs font-medium text-[var(--text-tertiary)] pt-2.5 text-right">
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
          <AutoResizeTextarea
            value={value}
            placeholder={schema.placeholder}
            onChange={onChange}
          />
        ) : (
          <input
            type={isPassword && !revealed ? 'password' : schema.type === 'number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={schema.placeholder}
            className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
          />
        )}

        {/* 액션 버튼 */}
        <div className="flex shrink-0 items-center gap-0.5 pt-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {isPassword && (
            <button
              type="button"
              onClick={() => setRevealed(prev => !prev)}
              className="rounded p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
              aria-label={revealed ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
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
              className="rounded p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
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

function DropdownSelect({ value, options, placeholder, onChange }: {
  value: string
  options: string[]
  placeholder?: string
  onChange: (value: string) => void
}) {
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

// ── 자동 크기 조절 텍스트에어리어 ───────────────────────

function AutoResizeTextarea({ value, placeholder, onChange }: {
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="flex-1 resize-none rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors leading-relaxed"
    />
  )
}
