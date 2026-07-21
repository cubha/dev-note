// src/features/cards/MarkdownEditorWithToggle.tsx

import { useState, useRef, useCallback } from 'react'
import { Eye, EyeOff, FileText, Code2 } from 'lucide-react'
import { useMarkdownHtml } from '../../shared/hooks/useMarkdownHtml'
import { NoteEditor } from './NoteEditor'

type ViewMode = 'source' | 'split' | 'full'

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

// 카드 모달(CardFloatingView.MarkdownView)과 동일한 전체 폭 렌더링 — 분할 없이 문서 가독성 우선
const MarkdownFullView = ({ value }: { value: string }) => {
  const html = useMarkdownHtml(value)

  return (
    <div className="flex-1 overflow-y-auto">
      {html ? (
        <div className="md-preview px-6 py-5" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-[var(--text-placeholder)]">마크다운을 입력하면 여기에 미리보기가 표시됩니다</p>
        </div>
      )}
    </div>
  )
}

export const MarkdownEditorWithToggle = ({ value, onChange }: {
  value: string
  onChange: (val: string) => void
}) => {
  const [mode, setMode] = useState<ViewMode>('source')

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-end gap-1 px-4 py-1.5 border-b border-[var(--border-default)] shrink-0">
        <button
          type="button"
          onClick={() => setMode((prev) => (prev === 'split' ? 'source' : 'split'))}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border-none hover:bg-[var(--bg-surface-hover)] ${
            mode === 'split' ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
          title={mode === 'split' ? '미리보기 닫기' : '미리보기 열기 (분할)'}
        >
          {mode === 'split' ? <EyeOff size={13} /> : <Eye size={13} />}
          {mode === 'split' ? '소스' : '미리보기'}
        </button>
        <button
          type="button"
          onClick={() => setMode((prev) => (prev === 'full' ? 'source' : 'full'))}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border-none hover:bg-[var(--bg-surface-hover)] ${
            mode === 'full' ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
          title={mode === 'full' ? '소스 보기' : '전체 화면으로 마크다운 변환 보기'}
        >
          {mode === 'full' ? <Code2 size={13} /> : <FileText size={13} />}
          {mode === 'full' ? '소스' : 'MD변환'}
        </button>
      </div>
      {mode === 'split' ? (
        <MarkdownSplitView value={value} onChange={onChange} />
      ) : mode === 'full' ? (
        <MarkdownFullView value={value} />
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
