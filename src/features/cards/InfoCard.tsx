import { useState, useRef, useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  MoreVertical, Pin, PinOff, Pencil, Trash2, Copy, Eye, GripVertical,
} from 'lucide-react'
import type { FuseResultMatch } from 'fuse.js'
import type { Item } from '../../core/db'
import type { CardContent as CardContentType, HybridContent } from '../../core/types'
import { TYPE_META } from '../../core/types'
import { CardContentView } from './CardContent'
import { copyToClipboard } from '../../shared/utils/clipboard'
import { ICON_MAP } from '../../shared/constants'
import { highlightByQuery } from '../../shared/utils/highlight'
import { extractSearchText } from '../../core/content'
import { cardViewAtom, searchQueryAtom } from '../../store/atoms'
import { useClickOutside } from '../../shared/hooks/useClickOutside'
import { IconButton } from '../../shared/components/IconButton'
import { Badge } from '../../shared/components/Badge'

/** Fuse.js indices 기반 <mark> 하이라이트 (제목/태그 전용) */
const highlightText = (
  text: string,
  indices?: ReadonlyArray<[number, number]>,
): React.ReactNode => {
  if (!indices || indices.length === 0) return text
  const result: React.ReactNode[] = []
  let lastIdx = 0
  for (const [start, end] of indices) {
    if (start > lastIdx) result.push(text.slice(lastIdx, start))
    result.push(
      <mark key={start} className="search-hl">
        {text.slice(start, end + 1)}
      </mark>,
    )
    lastIdx = end + 1
  }
  if (lastIdx < text.length) result.push(text.slice(lastIdx))
  return <>{result}</>
}


interface InfoCardProps {
  item: Item
  content: CardContentType
  matches?: readonly FuseResultMatch[]
  onEdit: (item: Item) => void
  onDelete: (item: Item) => void
  onTogglePin: (item: Item) => void
  draggable?: boolean
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void
}

export const InfoCard = ({
  item, content, matches, onEdit, onDelete, onTogglePin,
  draggable: isDraggable, isDragging, isDragOver,
  onDragStart, onDragEnd, onDragOver, onDrop,
}: InfoCardProps) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const meta = TYPE_META[item.type]
  const IconComponent = ICON_MAP[item.type]
  const setCardView = useSetAtom(cardViewAtom)

  const searchQuery = useAtomValue(searchQueryAtom)

  const titleMatch = matches?.find((m) => m.key === 'item.title')
  const tagMatches = matches?.filter((m) => m.key === 'item.tags') ?? []

  const closeMenu = useCallback(() => setMenuOpen(false), [])
  useClickOutside(menuRef, menuOpen, closeMenu)

  const handleCopyAll = () => {
    const text = extractSearchText(content)
    void copyToClipboard(`${item.title}\n${text}`, '카드 정보')
    setMenuOpen(false)
  }

  return (
    <div
      className={`card animate-fade-in cursor-pointer relative flex flex-col transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'} ${isDragOver ? 'ring-2 ring-[var(--text-active)] ring-offset-2 ring-offset-[var(--bg-base)]' : ''}`}
      data-type={item.type}
      data-pinned={item.pinned}
      draggable={isDraggable}
      onClick={() => onEdit(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onEdit(item) }}
    >
      {/* ── 드래그 핸들 ─────────────────── */}
      {isDraggable && (
        <div
          className={`absolute top-2 left-2 transition-opacity ${hovered ? 'opacity-40' : 'opacity-0'} text-[var(--text-placeholder)] pointer-events-none`}
        >
          <GripVertical size={14} />
        </div>
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
              {titleMatch
                ? highlightText(item.title, titleMatch.indices)
                : item.title}
            </h3>
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: `var(--badge-${meta.colorKey}-text)` }}
              >
                {meta.label}
              </span>
            </div>
          </div>
        </div>

        {/* 우측 액션 영역 */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* 조회 버튼 (hover 시 노출) */}
          {hovered && (
            <IconButton
              icon={<Eye size={14} />}
              size="md"
              tooltip="조회 (읽기 전용)"
              onClick={(e) => { e.stopPropagation(); setCardView({ item, content }) }}
              className="rounded-md"
            />
          )}

          {/* 메뉴 버튼 */}
          <div className="relative" ref={menuRef}>
            <IconButton
              icon={<MoreVertical size={16} />}
              size="md"
              tooltip="카드 메뉴"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((prev) => !prev) }}
              className="rounded-md"
            />

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
      </div>

      {/* 핀 표시 */}
      {item.pinned && (
        <div className="px-4 pb-1">
          <Badge className="gap-1 text-[var(--text-warning)] px-0 py-0">
            <Pin size={10} />
            고정됨
          </Badge>
        </div>
      )}

      {/* 태그 */}
      {item.tags.length > 0 && (
        <div className="flex gap-1 px-4 pb-2 overflow-hidden shrink-0">
          {item.tags.map((tag) => {
            const tm = tagMatches.find((m) => m.value === tag)
            return (
              <Badge
                key={tag}
                variant={tm ? 'accent' : 'muted'}
                className="rounded-md transition-colors"
              >
                #{tm ? highlightText(tag, tm.indices) : tag}
              </Badge>
            )
          })}
        </div>
      )}


      {/* 구분선 */}
      <div className="mx-4 h-px bg-[var(--border-default)]" />

      {/* 콘텐츠 영역 */}
      <div className="pt-3 flex-1 overflow-hidden">
        {item.type === 'document' && content.format === 'hybrid'
          ? <DocumentPreview content={content} searchQuery={searchQuery} />
          : item.type === 'note'
            ? <NotePreview content={content} searchQuery={searchQuery} />
            : <CardContentView content={content} searchQuery={searchQuery} excludeMultiline />
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

/** 섹션별 핵심 콘텐츠 1~2줄 요약 생성 */
const getSectionSummary = (section: import('../../core/types').AnySection): string => {
  switch (section.type) {
    case 'credentials':
      return section.items
        .slice(0, 2)
        .map((c) => {
          const addr = c.host ? `${c.username || '?'}@${c.host}${c.port ? ':' + c.port : ''}` : c.label
          return addr
        })
        .join(', ')
    case 'urls':
      return section.items
        .slice(0, 3)
        .map((u) => u.label || u.url.replace(/^https?:\/\//, '').slice(0, 30))
        .join(' · ')
    case 'env':
      return section.pairs
        .slice(0, 4)
        .map((p) => p.key)
        .join(', ')
    case 'code':
      return `${section.language}: ${section.code.split('\n')[0].slice(0, 40)}`
    case 'markdown': {
      const lines = section.text.split('\n').filter(Boolean)
      return lines[0]?.replace(/^#+\s*/, '').slice(0, 50) || ''
    }
  }
}

const DocumentPreview = ({ content, searchQuery }: { content: HybridContent; searchQuery: string }) => {
  if (content.sections.length === 0) {
    return (
      <div className="px-4 pb-3">
        <p className="text-sm text-[var(--text-tertiary)] italic m-0">빈 문서</p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-3 space-y-1.5">
      {content.sections.slice(0, 3).map((section) => {
        const summary = getSectionSummary(section)
        return (
          <div key={section.id} className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <span className="shrink-0">{SECTION_ICONS[section.type] ?? '📄'}</span>
              <span className="font-medium truncate">{section.title || section.type}</span>
            </div>
            {summary && (
              <p className="text-[11px] text-[var(--text-tertiary)] font-mono truncate m-0 pl-5 leading-relaxed">
                {highlightByQuery(summary, searchQuery)}
              </p>
            )}
          </div>
        )
      })}
      {content.sections.length > 3 && (
        <p className="text-[10px] text-[var(--text-tertiary)] m-0 pl-5">
          +{content.sections.length - 3}개 섹션
        </p>
      )}
    </div>
  )
}

// ── Note/Custom 미리보기 ─────────────────

const NotePreview = ({ content, searchQuery }: { content: CardContentType; searchQuery: string }) => {
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
        {highlightByQuery(text, searchQuery)}
      </p>
    </div>
  )
}

// ── 메뉴 버튼 ──────────────────────────

const MenuButton = ({ icon, label, danger, onClick }: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onClick: (e: React.MouseEvent) => void
}) => {
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
