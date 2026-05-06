// src/features/cards/MarkdownEditorWithToggle.tsx

import { useState, useRef, useCallback } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useMarkdownHtml } from '../../shared/hooks/useMarkdownHtml'
import { NoteEditor } from './NoteEditor'

const MarkdownSplitView = ({ value, onChange }: {
  value: string
  onChange: (val: string) => void
}) => {
  const html = useMarkdownHtml(value)
  const previewRef = useRef<HTMLDivElement>(null)

  const handleEditorScroll = useCallback((ratio: number) => {
    const preview = previewRef.current
    if (!preview) return
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight)
  }, [])

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 overflow-hidden border-r border-[var(--border-default)]">
        <NoteEditor
          value={value}
          placeholderText="마크다운으로 입력하세요..."
          onChange={onChange}
          onScroll={handleEditorScroll}
        />
      </div>
      <div ref={previewRef} className="flex-1 overflow-y-auto">
        {html ? (
          <div className="md-preview px-6 py-5" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[var(--text-placeholder)]">마크다운을 입력하면 여기에 미리보기가 표시됩니다</p>
          </div>
        )}
      </div>
    </div>
  )
}

export const MarkdownEditorWithToggle = ({ value, onChange }: {
  value: string
  onChange: (val: string) => void
}) => {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-end px-4 py-1.5 border-b border-[var(--border-default)] shrink-0">
        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border-none text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
          title={showPreview ? '미리보기 닫기' : '미리보기 열기'}
        >
          {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
          {showPreview ? '소스' : '미리보기'}
        </button>
      </div>
      {showPreview ? (
        <MarkdownSplitView value={value} onChange={onChange} />
      ) : (
        <NoteEditor
          value={value}
          placeholderText="마크다운으로 자유롭게 입력하세요..."
          onChange={onChange}
        />
      )}
    </div>
  )
}
