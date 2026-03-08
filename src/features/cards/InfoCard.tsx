import { useState, useRef, useEffect } from 'react'
import { useSetAtom } from 'jotai'
import {
  Terminal, Database, Globe, FileText, Puzzle, FileStack,
  MoreVertical, Pin, PinOff, Pencil, Trash2, Copy, Eye,
} from 'lucide-react'
import type { Item, ItemType } from '../../core/db'
import type { CardContent as CardContentType, HybridContent } from '../../core/types'
import { TYPE_META } from '../../core/types'
import { CardContentView } from './CardContent'
import { copyToClipboard } from '../../shared/utils/clipboard'
import { extractSearchText } from '../../core/content'
import { cardViewAtom } from '../../store/atoms'

const ICON_MAP: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  custom: Puzzle,
  document: FileStack,
}

interface InfoCardProps {
  item: Item
  content: CardContentType
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
  onTogglePin: (item: Item) => void
  similarity?: number   // 시맨틱 검색 유사도 (0-100)
}

export function InfoCard({ item, content, onEdit, onDelete, onTogglePin, similarity }: InfoCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const meta = TYPE_META[item.type]
  const IconComponent = ICON_MAP[item.type]
  const setCardView = useSetAtom(cardViewAtom)

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
      className="card animate-fade-in cursor-pointer relative flex flex-col"
      data-type={item.type}
      data-pinned={item.pinned}
      onClick={() => onEdit(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onEdit(item) }}
    >
      {/* ── 조회 버튼 (hover 시 노출) ─── */}
      {hovered && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setCardView({ item, content })
          }}
          className="absolute top-2 right-10 z-10 flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-sm"
          aria-label="조회"
          title="조회 (읽기 전용)"
        >
          <Eye size={14} />
        </button>
      )}

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
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: `var(--badge-${meta.colorKey}-text)` }}
              >
                {meta.label}
              </span>
              {similarity !== undefined && (
                <span className="rounded-full bg-[var(--badge-db-bg)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--badge-db-text)]">
                  {similarity}%
                </span>
              )}
            </div>
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
                onClick={(e) => { e.stopPropagation(); onDelete(item); setMenuOpen(false) }}
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
        <div className="flex gap-1 px-4 pb-2 overflow-hidden shrink-0">
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
      <div className="pt-3 flex-1 overflow-hidden">
        {item.type === 'document' && content.format === 'hybrid'
          ? <DocumentPreview content={content} />
          : (item.type === 'note' || item.type === 'custom')
            ? <NotePreview content={content} />
            : <CardContentView content={content} excludeMultiline />
        }
      </div>
    </div>
  )
}

// ── Document 미리보기 (섹션 요약) ────────────

const SECTION_ICONS: Record<string, string> = {
  credentials: '🔑',
  urls: '🔗',
  env: '⚙️',
  code: '💻',
  markdown: '📝',
}

function DocumentPreview({ content }: { content: HybridContent }) {
  if (content.sections.length === 0) {
    return (
      <div className="px-4 pb-3">
        <p className="text-sm text-[var(--text-tertiary)] italic m-0">빈 문서</p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-3 space-y-1">
      {content.sections.slice(0, 4).map((section) => {
        let detail = ''
        switch (section.type) {
          case 'credentials':
            detail = `(${section.items.length})`
            break
          case 'urls':
            detail = `(${section.items.length})`
            break
          case 'env':
            detail = `(${section.pairs.length})`
            break
          case 'code':
            detail = section.language
            break
        }
        return (
          <div key={section.id} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span>{SECTION_ICONS[section.type] ?? '📄'}</span>
            <span className="truncate">{section.title || section.type}</span>
            {detail && <span className="text-[var(--text-tertiary)]">{detail}</span>}
          </div>
        )
      })}
      {content.sections.length > 4 && (
        <p className="text-[10px] text-[var(--text-tertiary)] m-0">
          +{content.sections.length - 4}개 섹션
        </p>
      )}
    </div>
  )
}

// ── Note/Custom 미리보기 ─────────────────

function NotePreview({ content }: { content: CardContentType }) {
  const text =
    content.format === 'structured'
      ? (content.fields.find((f) => f.key === 'content')?.value ?? '')
      : content.format === 'legacy'
        ? content.text
        : ''

  if (!text) {
    return (
      <div className="px-4 pb-3">
        <p className="text-sm text-[var(--text-tertiary)] italic m-0">내용이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-3">
      <p className="text-sm text-[var(--text-secondary)] font-mono whitespace-pre-wrap line-clamp-4 break-all m-0 leading-relaxed">
        {text}
      </p>
    </div>
  )
}

// ── 메뉴 버튼 ──────────────────────────

function MenuButton({ icon, label, danger, onClick }: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onClick: (e: React.MouseEvent) => void
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
