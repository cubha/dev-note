import { useState, useRef, useEffect } from 'react'
import {
  Terminal, Database, Globe, FileText, Puzzle,
  MoreVertical, Pin, PinOff, Pencil, Trash2, Copy,
} from 'lucide-react'
import type { Item, ItemType } from '../../core/db'
import type { CardContent as CardContentType } from '../../core/types'
import { TYPE_META } from '../../core/types'
import { CardContentView } from './CardContent'
import { copyToClipboard } from '../../shared/utils/clipboard'
import { extractSearchText } from '../../core/content'

const ICON_MAP: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  custom: Puzzle,
}

interface InfoCardProps {
  item: Item
  content: CardContentType
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
  onTogglePin: (item: Item) => void
}

export function InfoCard({ item, content, onEdit, onDelete, onTogglePin }: InfoCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const meta = TYPE_META[item.type]
  const IconComponent = ICON_MAP[item.type]

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('click', close, { capture: true })
    return () => document.removeEventListener('click', close, { capture: true })
  }, [menuOpen])

  const handleCopyAll = () => {
    const text = extractSearchText(content)
    void copyToClipboard(`${item.title}\n${text}`, '카드 정보')
    setMenuOpen(false)
  }

  return (
    <div
      className="card animate-fade-in cursor-pointer"
      data-type={item.type}
      data-pinned={item.pinned}
      onClick={() => onEdit(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onEdit(item) }}
    >
      {/* ── 헤더 ────────────────────────── */}
      <div className="flex items-start justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* 타입 아이콘 */}
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: `var(--badge-${meta.colorKey}-bg)`,
              color: `var(--badge-${meta.colorKey}-text)`,
            }}
          >
            <IconComponent size={16} />
          </div>
          {/* 제목 + 타입 */}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate m-0">
              {item.title}
            </h3>
            <span
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: `var(--badge-${meta.colorKey}-text)` }}
            >
              {meta.label}
            </span>
          </div>
        </div>

        {/* 액션 메뉴 */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMenuOpen((prev) => !prev)
            }}
            className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer bg-transparent border-none"
            aria-label="카드 메뉴"
          >
            <MoreVertical size={16} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 w-40 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg animate-scale-in">
              <MenuButton
                icon={<Pencil size={14} />}
                label="편집"
                onClick={() => { onEdit(item); setMenuOpen(false) }}
              />
              <MenuButton
                icon={item.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                label={item.pinned ? '핀 해제' : '핀 고정'}
                onClick={() => { onTogglePin(item); setMenuOpen(false) }}
              />
              <MenuButton
                icon={<Copy size={14} />}
                label="전체 복사"
                onClick={handleCopyAll}
              />
              <div className="my-1 h-px bg-[var(--border-default)]" />
              <MenuButton
                icon={<Trash2 size={14} />}
                label="삭제"
                danger
                onClick={() => { onDelete(item); setMenuOpen(false) }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 핀 표시 */}
      {item.pinned && (
        <div className="px-4 pb-1">
          <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-warning)]">
            <Pin size={10} />
            고정됨
          </span>
        </div>
      )}

      {/* 태그 */}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-2">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* 구분선 */}
      <div className="mx-4 h-px bg-[var(--border-default)]" />

      {/* 콘텐츠 영역 */}
      <div className="pt-3">
        <CardContentView content={content} />
      </div>
    </div>
  )
}

// ── 메뉴 버튼 ──────────────────────────

function MenuButton({ icon, label, danger, onClick }: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors cursor-pointer bg-transparent border-none ${
        danger
          ? 'text-[var(--text-error)] hover:bg-[var(--bg-error-hover)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
