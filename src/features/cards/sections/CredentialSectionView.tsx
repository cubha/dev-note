import { useState } from 'react'
import { Eye, EyeOff, Copy, Plus, X, Server, Database, HardDrive } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { CredentialEntry } from '../../../core/types'
import { copyToClipboard } from '../../../shared/utils/clipboard'

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Server,
  database: Database,
  other: HardDrive,
}

interface CredentialSectionViewProps {
  items: CredentialEntry[]
  onChange: (items: CredentialEntry[]) => void
}

export function CredentialSectionView({ items, onChange }: CredentialSectionViewProps) {
  return (
    <div className="space-y-3">
      {items.map((entry, idx) => (
        <CredentialRow
          key={entry.id}
          entry={entry}
          onChange={(updated) => {
            const next = [...items]
            next[idx] = updated
            onChange(next)
          }}
          onDelete={() => onChange(items.filter((_, i) => i !== idx))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, createEmptyCredential()])}
        className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none px-0"
      >
        <Plus size={12} /> 항목 추가
      </button>
    </div>
  )
}

function CredentialRow({ entry, onChange, onDelete }: {
  entry: CredentialEntry
  onChange: (e: CredentialEntry) => void
  onDelete: () => void
}) {
  const [showPw, setShowPw] = useState(false)
  const CatIcon = CATEGORY_ICONS[entry.category] ?? HardDrive

  const update = (patch: Partial<CredentialEntry>) => onChange({ ...entry, ...patch })

  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 space-y-2">
      {/* 라벨 + 카테고리 + 삭제 */}
      <div className="flex items-center gap-2">
        <CatIcon size={14} className="text-[var(--text-tertiary)] shrink-0" />
        <input
          type="text"
          value={entry.label}
          onChange={(e) => update({ label: e.target.value })}
          placeholder="라벨 (운영서버, 개발 DB 등)"
          className="flex-1 min-w-0 bg-transparent text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border-none outline-none"
        />
        <select
          value={entry.category}
          onChange={(e) => update({ category: e.target.value as CredentialEntry['category'] })}
          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-default)] cursor-pointer"
        >
          <option value="server">서버</option>
          <option value="database">DB</option>
          <option value="other">기타</option>
        </select>
        <button
          type="button"
          onClick={onDelete}
          className="text-[var(--text-placeholder)] hover:text-[var(--text-error)] cursor-pointer bg-transparent border-none p-0.5"
        >
          <X size={12} />
        </button>
      </div>

      {/* 필드 그리드 */}
      <div className="grid grid-cols-2 gap-2">
        <FieldInput label="Host" value={entry.host} onChange={(v) => update({ host: v })} placeholder="10.0.0.1" />
        <FieldInput label="Port" value={entry.port} onChange={(v) => update({ port: v })} placeholder="22" />
        <FieldInput label="Username" value={entry.username} onChange={(v) => update({ username: v })} placeholder="admin" />
        <div>
          <label className="block text-[10px] text-[var(--text-tertiary)] mb-0.5">Password</label>
          <div className="relative flex items-center gap-1">
            <div className="relative flex-1">
              <input
                type={showPw ? 'text' : 'password'}
                value={entry.password}
                onChange={(e) => update({ password: e.target.value })}
                placeholder="••••••"
                className="w-full bg-[var(--bg-input)] rounded px-2 py-1 pr-6 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0 cursor-pointer bg-transparent border-none text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)]"
              >
                {showPw ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void copyToClipboard(entry.password, '비밀번호')}
              className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
            >
              <Copy size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* DB 이름 (category=database일 때만) */}
      {entry.category === 'database' && (
        <FieldInput label="Database" value={entry.database ?? ''} onChange={(v) => update({ database: v })} placeholder="prod_main" />
      )}

      {/* 비고 */}
      <FieldInput label="비고" value={entry.extra} onChange={(v) => update({ extra: v })} placeholder="접속 메모" />
    </div>
  )
}

function FieldInput({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[10px] text-[var(--text-tertiary)] mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--bg-input)] rounded px-2 py-1 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none"
      />
    </div>
  )
}

function createEmptyCredential(): CredentialEntry {
  return {
    id: nanoid(8),
    label: '',
    category: 'server',
    host: '',
    port: '',
    username: '',
    password: '',
    extra: '',
  }
}
