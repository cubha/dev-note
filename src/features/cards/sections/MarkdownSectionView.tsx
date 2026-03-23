import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { MarkdownSection } from '../../../core/types'
import { useResizableHeight } from '../../../shared/hooks/useResizableHeight'

interface MarkdownSectionViewProps {
  section: MarkdownSection
  onChange: (updated: MarkdownSection) => void
}

export const MarkdownSectionView = ({ section, onChange }: MarkdownSectionViewProps) => {
  const { height, handleDragStart } = useResizableHeight(60, 120)
  const [showPreview, setShowPreview] = useState(false)
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (!showPreview) return
    const result = marked.parse(section.text) as string
    setHtml(DOMPurify.sanitize(result))
  }, [showPreview, section.text])

  return (
    <div className="flex flex-col">
      {/* 툴바 */}
      <div className="flex items-center justify-end pb-1">
        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer border-none text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
          title={showPreview ? '소스 보기' : '미리보기'}
        >
          {showPreview ? <EyeOff size={12} /> : <Eye size={12} />}
          {showPreview ? '소스' : '미리보기'}
        </button>
      </div>

      {/* 에디터 / 미리보기 */}
      {showPreview ? (
        <div
          className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 overflow-y-auto"
          style={{ height, minHeight: 60 }}
        >
          {html ? (
            <div className="md-preview text-xs" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-xs text-[var(--text-placeholder)] italic m-0">내용이 없습니다</p>
          )}
        </div>
      ) : (
        <textarea
          value={section.text}
          onChange={(e) => onChange({ ...section, text: e.target.value })}
          placeholder="메모를 입력하세요..."
          style={{ height, resize: 'none' }}
          className="w-full bg-[var(--bg-input)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none leading-relaxed"
        />
      )}

      {/* 드래그 리사이즈 핸들 */}
      <div
        role="separator"
        aria-label="높이 조절"
        onMouseDown={handleDragStart}
        className="group flex items-center justify-center h-2 mt-0.5 rounded-b cursor-row-resize select-none"
      >
        <div className="w-8 h-0.5 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--text-tertiary)] transition-colors" />
      </div>
    </div>
  )
}
