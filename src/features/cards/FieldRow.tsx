import { useState } from 'react'
import { Eye, EyeOff, Copy, ExternalLink } from 'lucide-react'
import type { FieldType } from '../../core/types'
import { copyToClipboard } from '../../shared/utils/clipboard'
import { openUrl } from '../../shared/utils/url'

interface FieldRowProps {
  label: string
  value: string
  type: FieldType
}

export function FieldRow({ label, value, type }: FieldRowProps) {
  const [revealed, setRevealed] = useState(false)

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

      {/* 값 */}
      <div className="flex min-w-0 flex-1 items-start gap-1.5">
        {isMultiline ? (
          <span className="font-mono text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-all leading-relaxed">
            {value}
          </span>
        ) : isUrl ? (
          <button
            type="button"
            onClick={() => openUrl(value)}
            className="flex items-center gap-1 text-sm text-[var(--text-active)] hover:underline truncate cursor-pointer bg-transparent border-none p-0"
          >
            <span className="font-mono truncate">{value}</span>
            <ExternalLink size={12} className="shrink-0 opacity-60" />
          </button>
        ) : (
          <span className={`font-mono text-sm truncate ${isPassword ? 'tracking-wider text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
            {displayValue}
          </span>
        )}

        {/* 액션 버튼들 */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {isPassword && (
            <button
              type="button"
              onClick={() => setRevealed((prev) => !prev)}
              className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
              aria-label={revealed ? '비밀번호 숨기기' : '비밀번호 보기'}
            >
              {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          )}
          <button
            type="button"
            onClick={() => void copyToClipboard(value, label)}
            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
            aria-label={`${label} 복사`}
          >
            <Copy size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
