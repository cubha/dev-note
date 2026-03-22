import { useState, useRef, useEffect } from 'react'
import { useClickOutside } from '../../../shared/hooks/useClickOutside'
import {
  ChevronDown, ChevronRight, GripVertical, MoreVertical, Trash2, Pencil,
  Shield, Link, Terminal, Code, FileText, Clipboard,
} from 'lucide-react'
import type { SectionType } from '../../../core/types'
import { IconButton } from '../../../shared/components/IconButton'

const SECTION_ICONS: Record<SectionType, React.ComponentType<{ size?: number; className?: string }>> = {
  credentials: Shield,
  urls: Link,
  env: Terminal,
  code: Code,
  markdown: FileText,
}

const SECTION_LABELS: Record<SectionType, string> = {
  credentials: '접속 정보',
  urls: 'URL',
  env: '환경변수',
  code: '코드',
  markdown: '메모',
}

interface SectionWrapperProps {
  type: SectionType
  title: string
  collapsed: boolean
  onToggleCollapse: () => void
  onDelete: () => void
  onTitleChange: (title: string) => void
  onSmartPaste?: (text: string) => void
  dragHandleProps?: Record<string, unknown>
  children: React.ReactNode
}

export const SectionWrapper = ({
  type, title, collapsed, onToggleCollapse, onDelete, onTitleChange,
  onSmartPaste, dragHandleProps, children,
}: SectionWrapperProps) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(title)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const Icon = SECTION_ICONS[type]

  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false))

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleTitleSubmit = () => {
    const trimmed = editTitle.trim()
    onTitleChange(trimmed || SECTION_LABELS[type])
    setEditing(false)
  }

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-1 px-3 py-2 bg-[var(--bg-surface-hover)]">
        {/* 드래그 핸들 */}
        <div
          className="flex items-center justify-center w-5 h-5 cursor-grab text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] shrink-0"
          {...dragHandleProps}
        >
          <GripVertical size={14} />
        </div>

        {/* 접기/펼치기 */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="subtle-btn flex items-center justify-center w-5 h-5 shrink-0"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* 섹션 아이콘 */}
        <Icon size={14} className="text-[var(--text-tertiary)] shrink-0" />

        {/* 제목 */}
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSubmit()
              if (e.key === 'Escape') { setEditTitle(title); setEditing(false) }
            }}
            className="flex-1 min-w-0 bg-transparent text-xs font-medium text-[var(--text-primary)] border-none outline-none px-1 py-0.5 rounded bg-[var(--bg-input)]"
          />
        ) : (
          <span className="flex-1 text-xs font-medium text-[var(--text-secondary)] truncate">
            {title || SECTION_LABELS[type]}
          </span>
        )}

        {/* Smart Paste 버튼 */}
        {onSmartPaste && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPasteOpen(prev => !prev) }}
            title="텍스트 붙여넣기"
            className={`flex items-center justify-center w-6 h-6 rounded cursor-pointer bg-transparent border-none shrink-0 transition-colors ${
              pasteOpen
                ? 'text-[var(--accent)] bg-[var(--bg-surface)]'
                : 'text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)]'
            }`}
          >
            <Clipboard size={13} />
          </button>
        )}

        {/* 메뉴 */}
        <div className="relative" ref={menuRef}>
          <IconButton
            icon={<MoreVertical size={13} />}
            size="sm"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
            className="text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] shrink-0"
          />

          {menuOpen && (
            <div className="absolute right-0 top-7 z-50 w-32 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg animate-scale-in">
              <button
                type="button"
                onClick={() => { setEditing(true); setEditTitle(title); setMenuOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer bg-transparent border-none"
              >
                <Pencil size={12} /> 이름 변경
              </button>
              <button
                type="button"
                onClick={() => { onDelete(); setMenuOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-error)] hover:bg-[var(--bg-error-hover)] cursor-pointer bg-transparent border-none"
              >
                <Trash2 size={12} /> 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Smart Paste 영역 */}
      {pasteOpen && onSmartPaste && (
        <div className="px-3 py-2 border-b border-[var(--border-default)] bg-[var(--bg-main)] space-y-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={`${SECTION_LABELS[type]} 형식의 텍스트를 붙여넣으세요...`}
            rows={3}
            className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none resize-y"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={!pasteText.trim()}
              onClick={() => {
                onSmartPaste(pasteText.trim())
                setPasteText('')
                setPasteOpen(false)
              }}
              className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer transition-colors"
            >
              <Clipboard size={10} /> 적용
            </button>
            <button
              type="button"
              onClick={() => { setPasteText(''); setPasteOpen(false) }}
              className="rounded-md px-2.5 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer bg-transparent border-none transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 본문 */}
      {!collapsed && (
        <div className="px-3 py-3">
          {children}
        </div>
      )}
    </div>
  )
}
