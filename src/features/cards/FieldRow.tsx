import { Copy, ExternalLink } from 'lucide-react'
import type { FieldType } from '../../core/types'
import { copyToClipboard } from '../../shared/utils/clipboard'
import { openUrl } from '../../shared/utils/url'
import { highlightByQuery } from '../../shared/utils/highlight'
import { usePasswordReveal } from '../../shared/hooks/usePasswordReveal'

interface FieldRowProps {
  label: string
  value: string
  type: FieldType
  searchQuery?: string
}

export const FieldRow = ({ label, value, type, searchQuery = '' }: FieldRowProps) => {
  const { revealed, toggle, Icon, ariaLabel } = usePasswordReveal()

  if (!value) return null

  const isPassword = type === 'password'
  const isUrl = type === 'url' || type === 'email'
  const isMultiline = type === 'multiline'

  const displayValue = isPassword && !revealed ? '••••••••' : value

  return (
    <div className="group flex items-start gap-3 py-1.5">
      {/* 라벨 */}
      <span className="w-20 shrink-0 text-xs text-[var(--text-tertiary)] pt-0.5">
        {label}
      </span>

      {/* 값 — 클릭 시 복사 */}
      <div className="flex min-w-0 flex-1 items-start gap-1.5">
        {isMultiline ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void copyToClipboard(value, label) }}
            className="font-mono text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-all leading-relaxed text-left bg-transparent border-none p-0 cursor-pointer hover:text-[var(--text-primary)] transition-colors"
          >
            {highlightByQuery(value, searchQuery)}
          </button>
        ) : isUrl ? (
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openUrl(value) }}
              className="flex items-center gap-1 text-sm text-[var(--text-active)] hover:underline truncate cursor-pointer bg-transparent border-none p-0"
            >
              <span className="font-mono truncate">{highlightByQuery(value, searchQuery)}</span>
              <ExternalLink size={12} className="shrink-0 opacity-60" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void copyToClipboard(value, label) }}
            className={`font-mono text-sm truncate text-left bg-transparent border-none p-0 cursor-pointer transition-colors ${
              isPassword
                ? 'tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                : 'text-[var(--text-primary)] hover:text-[var(--text-active)]'
            }`}
          >
            {isPassword ? displayValue : highlightByQuery(displayValue, searchQuery)}
          </button>
        )}

        {/* 액션 버튼들 */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {isPassword && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle() }}
              className="subtle-btn rounded p-1 hover:bg-[var(--bg-surface-hover)]"
              aria-label={ariaLabel}
            >
              <Icon size={13} />
            </button>
          )}
          {isUrl && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void copyToClipboard(value, label) }}
              className="subtle-btn rounded p-1 hover:bg-[var(--bg-surface-hover)]"
              aria-label={`${label} 복사`}
            >
              <Copy size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
