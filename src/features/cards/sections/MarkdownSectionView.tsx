import type { MarkdownSection } from '../../../core/types'
import { useResizableHeight } from '../../../shared/hooks/useResizableHeight'

interface MarkdownSectionViewProps {
  section: MarkdownSection
  onChange: (updated: MarkdownSection) => void
}

export function MarkdownSectionView({ section, onChange }: MarkdownSectionViewProps) {
  const { height, handleDragStart } = useResizableHeight(60, 120)

  return (
    <div className="flex flex-col">
      <textarea
        value={section.text}
        onChange={(e) => onChange({ ...section, text: e.target.value })}
        placeholder="메모를 입력하세요..."
        style={{ height, resize: 'none' }}
        className="w-full bg-[var(--bg-input)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none leading-relaxed"
      />
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
