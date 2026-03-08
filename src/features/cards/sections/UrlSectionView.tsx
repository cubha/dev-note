import { ExternalLink, Copy, Plus, X } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { UrlEntry } from '../../../core/types'
import { copyToClipboard } from '../../../shared/utils/clipboard'

interface UrlSectionViewProps {
  items: UrlEntry[]
  onChange: (items: UrlEntry[]) => void
}

export function UrlSectionView({ items, onChange }: UrlSectionViewProps) {
  return (
    <div className="space-y-2">
      {items.map((entry, idx) => (
        <div key={entry.id} className="flex items-start gap-2 group">
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={entry.label}
                onChange={(e) => {
                  const next = [...items]
                  next[idx] = { ...entry, label: e.target.value }
                  onChange(next)
                }}
                placeholder="라벨"
                className="w-24 shrink-0 bg-transparent text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border-none outline-none"
              />
              {entry.method && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-[var(--badge-api-bg)] text-[var(--badge-api-text)]">
                  {entry.method}
                </span>
              )}
            </div>
            <input
              type="url"
              value={entry.url}
              onChange={(e) => {
                const next = [...items]
                next[idx] = { ...entry, url: e.target.value }
                onChange(next)
              }}
              placeholder="https://example.com"
              className="w-full bg-[var(--bg-input)] rounded px-2 py-1 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none"
            />
            <input
              type="text"
              value={entry.note}
              onChange={(e) => {
                const next = [...items]
                next[idx] = { ...entry, note: e.target.value }
                onChange(next)
              }}
              placeholder="메모 (선택)"
              className="w-full bg-transparent text-[10px] text-[var(--text-tertiary)] placeholder:text-[var(--text-placeholder)] border-none outline-none"
            />
          </div>

          <div className="flex items-center gap-0.5 pt-1 shrink-0">
            {entry.url && (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-active)] cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} />
              </a>
            )}
            <button
              type="button"
              onClick={() => void copyToClipboard(entry.url, 'URL')}
              className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
            >
              <Copy size={12} />
            </button>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== idx))}
              className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-error)] cursor-pointer bg-transparent border-none"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...items, createEmptyUrl()])}
        className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none px-0"
      >
        <Plus size={12} /> URL 추가
      </button>
    </div>
  )
}

function createEmptyUrl(): UrlEntry {
  return { id: nanoid(8), label: '', url: '', note: '' }
}
