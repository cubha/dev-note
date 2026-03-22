import { useState, useCallback, useRef } from 'react'
import { ExternalLink, Copy, Plus, X, ChevronDown, ChevronUp, StickyNote } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { UrlEntry, UrlNoteCard } from '../../../core/types'
import { copyToClipboard } from '../../../shared/utils/clipboard'
import { isSafeUrl } from '../../../shared/utils/url'
import { Badge } from '../../../shared/components/Badge'

interface UrlSectionViewProps {
  items: UrlEntry[]
  onChange: (items: UrlEntry[]) => void
}

export const UrlSectionView = ({ items, onChange }: UrlSectionViewProps) => {
  return (
    <div className="space-y-4">
      {items.map((entry, idx) => (
        <UrlEntryRow
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
        onClick={() => onChange([...items, createEmptyUrl()])}
        className="subtle-btn flex items-center gap-1.5 text-xs px-0"
      >
        <Plus size={12} /> URL 추가
      </button>
    </div>
  )
}

// ── 개별 URL 항목 ──────────────────────────────────────────

interface UrlEntryRowProps {
  entry: UrlEntry
  onChange: (updated: UrlEntry) => void
  onDelete: () => void
}

const UrlEntryRow = ({ entry, onChange, onDelete }: UrlEntryRowProps) => {
  const noteCards = entry.noteCards ?? []
  // 초기 상태: 메모 내용이 있거나 메모카드가 있으면 펼침
  const [noteOpen, setNoteOpen] = useState(
    () => entry.note.trim().length > 0 || noteCards.length > 0,
  )

  const setField = <K extends keyof UrlEntry>(key: K, value: UrlEntry[K]) => {
    onChange({ ...entry, [key]: value })
  }

  const handleAddNoteCard = () => {
    const card: UrlNoteCard = { id: nanoid(8), title: '', text: '' }
    onChange({ ...entry, noteCards: [...noteCards, card] })
    setNoteOpen(true)
  }

  const handleNoteCardChange = (cardIdx: number, updated: UrlNoteCard) => {
    const next = [...noteCards]
    next[cardIdx] = updated
    onChange({ ...entry, noteCards: next })
  }

  const handleNoteCardDelete = (cardIdx: number) => {
    onChange({ ...entry, noteCards: noteCards.filter((_, i) => i !== cardIdx) })
  }

  const hasNote = entry.note.trim().length > 0

  return (
    <div className="group/entry flex flex-col gap-1.5">
      {/* ── 상단 행: 라벨 + 메서드 + 액션 버튼 ── */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={entry.label}
          onChange={(e) => setField('label', e.target.value)}
          placeholder="라벨"
          className="min-w-[60px] max-w-[140px] flex-shrink bg-transparent text-xs font-medium text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border-none outline-none truncate"
        />
        {entry.method && (
          <Badge className="font-bold bg-[var(--badge-api-bg)] text-[var(--badge-api-text)]">
            {entry.method}
          </Badge>
        )}

        <div className="flex-1" />

        {/* 메모 토글 */}
        <button
          type="button"
          onClick={() => setNoteOpen((prev) => !prev)}
          title={noteOpen ? '메모 접기' : '메모 펼치기'}
          className={`p-1 cursor-pointer bg-transparent border-none transition-colors ${
            hasNote || noteCards.length > 0
              ? 'text-[var(--text-accent,var(--border-accent))] opacity-80 hover:opacity-100'
              : 'text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)]'
          }`}
        >
          {noteOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {/* 외부 열기 */}
        {entry.url && isSafeUrl(entry.url) && (
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

        {/* 복사 */}
        <button
          type="button"
          onClick={() => void copyToClipboard(entry.url, 'URL')}
          className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
        >
          <Copy size={12} />
        </button>

        {/* 항목 삭제 */}
        <button
          type="button"
          onClick={onDelete}
          className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-error)] cursor-pointer bg-transparent border-none"
        >
          <X size={12} />
        </button>
      </div>

      {/* ── URL 입력 ── */}
      <input
        type="url"
        value={entry.url}
        onChange={(e) => setField('url', e.target.value)}
        placeholder="https://example.com"
        className="w-full bg-[var(--bg-input)] rounded px-2 py-1 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none"
      />

      {/* ── 메모 + 메모카드 영역 ── */}
      {noteOpen && (
        <div className="flex flex-col gap-2 pl-2 border-l-2 border-[var(--border-subtle)]">
          {/* 빠른 메모 (textarea) */}
          <AutoResizeTextarea
            value={entry.note}
            placeholder="빠른 메모..."
            onChange={(val) => setField('note', val)}
          />

          {/* 메모카드 목록 */}
          {noteCards.map((card, cardIdx) => (
            <NoteCardRow
              key={card.id}
              card={card}
              onChange={(updated) => handleNoteCardChange(cardIdx, updated)}
              onDelete={() => handleNoteCardDelete(cardIdx)}
            />
          ))}

          {/* 메모카드 추가 버튼 */}
          <button
            type="button"
            onClick={handleAddNoteCard}
            className="flex items-center gap-1 meta-text hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none px-0 self-start transition-colors"
          >
            <StickyNote size={10} />
            메모카드 추가
          </button>
        </div>
      )}
    </div>
  )
}

// ── 메모카드 행 ────────────────────────────────────────────

interface NoteCardRowProps {
  card: UrlNoteCard
  onChange: (updated: UrlNoteCard) => void
  onDelete: () => void
}

const NoteCardRow = ({ card, onChange, onDelete }: NoteCardRowProps) => {
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 space-y-1.5 relative group/card">
      {/* 삭제 버튼 */}
      <button
        type="button"
        onClick={onDelete}
        aria-label="메모카드 삭제"
        className="absolute top-1.5 right-1.5 p-0.5 text-[var(--text-placeholder)] hover:text-[var(--text-error)] cursor-pointer bg-transparent border-none opacity-0 group-hover/card:opacity-100 transition-opacity"
      >
        <X size={11} />
      </button>

      {/* 타이틀 */}
      <input
        type="text"
        value={card.title}
        onChange={(e) => onChange({ ...card, title: e.target.value })}
        placeholder="제목 (선택)"
        className="w-full bg-transparent text-[10px] font-semibold text-[var(--text-secondary)] placeholder:text-[var(--text-placeholder)] border-none outline-none pr-5"
      />

      {/* 내용 */}
      <AutoResizeTextarea
        value={card.text}
        placeholder="내용을 입력하세요..."
        onChange={(val) => onChange({ ...card, text: val })}
        minHeight={44}
        className="bg-transparent border-none px-0 py-0 rounded-none focus:border-none text-[10px] font-mono"
      />
    </div>
  )
}

// ── Auto-resize Textarea ────────────────────────────────────

interface AutoResizeTextareaProps {
  value: string
  placeholder: string
  onChange: (val: string) => void
  minHeight?: number
  className?: string
}

const AutoResizeTextarea = ({
  value,
  placeholder,
  onChange,
  minHeight = 56,
  className = '',
}: AutoResizeTextareaProps) => {
  const ref = useRef<HTMLTextAreaElement>(null)

  const adjust = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`
  }, [minHeight])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
        adjust()
      }}
      onFocus={adjust}
      placeholder={placeholder}
      rows={2}
      style={{ minHeight, resize: 'none' }}
      className={`w-full bg-[var(--bg-input)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none leading-relaxed ${className}`}
    />
  )
}

const createEmptyUrl = (): UrlEntry => {
  return { id: nanoid(8), label: '', url: '', note: '' }
}
