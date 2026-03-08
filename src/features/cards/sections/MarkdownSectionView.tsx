import type { MarkdownSection } from '../../../core/types'

interface MarkdownSectionViewProps {
  section: MarkdownSection
  onChange: (updated: MarkdownSection) => void
}

export function MarkdownSectionView({ section, onChange }: MarkdownSectionViewProps) {
  return (
    <textarea
      value={section.text}
      onChange={(e) => onChange({ ...section, text: e.target.value })}
      placeholder="메모를 입력하세요..."
      className="w-full min-h-[80px] bg-[var(--bg-input)] rounded-md px-3 py-2 text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] border border-[var(--border-default)] focus:border-[var(--border-accent)] outline-none resize-y leading-relaxed"
      rows={4}
    />
  )
}
