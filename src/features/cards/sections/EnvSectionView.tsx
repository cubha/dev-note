import { useState } from 'react'
import { Eye, EyeOff, Copy, Plus, X } from 'lucide-react'
import type { EnvEntry } from '../../../core/types'
import { copyToClipboard } from '../../../shared/utils/clipboard'

interface EnvSectionViewProps {
  pairs: EnvEntry[]
  onChange: (pairs: EnvEntry[]) => void
}

export function EnvSectionView({ pairs, onChange }: EnvSectionViewProps) {
  return (
    <div className="space-y-1.5">
      {pairs.map((entry, idx) => (
        <EnvRow
          key={idx}
          entry={entry}
          onChange={(updated) => {
            const next = [...pairs]
            next[idx] = updated
            onChange(next)
          }}
          onDelete={() => onChange(pairs.filter((_, i) => i !== idx))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...pairs, { key: '', value: '', secret: false }])}
        className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none px-0"
      >
        <Plus size={12} /> 변수 추가
      </button>
    </div>
  )
}

function EnvRow({ entry, onChange, onDelete }: {
  entry: EnvEntry
  onChange: (e: EnvEntry) => void
  onDelete: () => void
}) {
  const [showVal, setShowVal] = useState(!entry.secret)

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={entry.key}
        onChange={(e) => onChange({ ...entry, key: e.target.value })}
        placeholder="KEY"
        className="w-32 shrink-0 bg-[var(--bg-input)] rounded px-2 py-1 text-xs font-mono font-medium text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none"
      />
      <span className="text-[10px] text-[var(--text-placeholder)]">=</span>
      <input
        type={entry.secret && !showVal ? 'password' : 'text'}
        value={entry.value}
        onChange={(e) => onChange({ ...entry, value: e.target.value })}
        placeholder="value"
        className="flex-1 min-w-0 bg-[var(--bg-input)] rounded px-2 py-1 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none"
      />
      <button
        type="button"
        onClick={() => {
          if (entry.secret) setShowVal(!showVal)
          else onChange({ ...entry, secret: true })
        }}
        title={entry.secret ? (showVal ? '숨기기' : '보기') : '비밀로 설정'}
        className={`p-1 cursor-pointer bg-transparent border-none ${
          entry.secret ? 'text-[var(--text-warning)]' : 'text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)]'
        }`}
      >
        {entry.secret && !showVal ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <button
        type="button"
        onClick={() => void copyToClipboard(`${entry.key}=${entry.value}`, entry.key)}
        className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
      >
        <Copy size={12} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-error)] cursor-pointer bg-transparent border-none"
      >
        <X size={12} />
      </button>
    </div>
  )
}
