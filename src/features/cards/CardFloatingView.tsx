import { useEffect, useRef, useState, useCallback } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import {
  Terminal, Database, Globe, FileText, Puzzle, FileStack, X, Sparkles, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { toast } from 'sonner'
import { cardViewAtom, aiApiKeyAtom } from '../../store/atoms'
import { TYPE_META } from '../../core/types'
import type { CardContent as CardContentType } from '../../core/types'
import type { ItemType } from '../../core/db'
import { extractSearchText } from '../../core/content'
import { AIService } from '../../core/ai'
import type { SummaryResult } from '../../core/ai'
import { CardContentView } from './CardContent'
import { hasFormFields } from './fieldHelpers'

// ── 마크다운 렌더링 뷰 (custom 타입 전용) ────────────────────

function MarkdownView({ content }: { content: CardContentType }) {
  const [html, setHtml] = useState('')

  const rawText =
    content.format === 'structured'
      ? (content.fields.find((f) => f.key === 'content')?.value ?? '')
      : content.format === 'legacy'
        ? content.text
        : ''

  useEffect(() => {
    const result = marked.parse(rawText) as string
    setHtml(DOMPurify.sanitize(result))
  }, [rawText])

  if (!rawText) {
    return (
      <div className="flex h-full items-center justify-center py-8">
        <p className="text-sm text-[var(--text-placeholder)]">내용이 없습니다</p>
      </div>
    )
  }

  return (
    <div
      className="md-preview px-6 py-4"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  custom: Puzzle,
  document: FileStack,
}


// ── AI 요약 섹션 ─────────────────────────────────────────────

function AISummarySection({ content, cardType }: { content: CardContentType; cardType: ItemType }) {
  const apiKey = useAtomValue(aiApiKeyAtom)
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(true)

  const handleSummarize = useCallback(async () => {
    if (!apiKey) return
    setLoading(true)
    try {
      const service = new AIService(apiKey)
      const text = extractSearchText(content)
      if (!text.trim()) {
        toast.error('요약할 콘텐츠가 없습니다.')
        return
      }
      const result = await service.summarize(text, cardType)
      setSummary(result)
      setExpanded(true)
    } catch (err) {
      toast.error(`요약 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setLoading(false)
    }
  }, [apiKey, content, cardType])

  if (!apiKey) return null

  return (
    <div className="shrink-0">
      {/* 요약 버튼 (아직 요약이 없을 때) */}
      {!summary && (
        <div className="px-6 py-2 border-b border-[var(--border-default)]">
          <button
            type="button"
            onClick={() => void handleSummarize()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--badge-api-text)] bg-[var(--badge-api-bg)] hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity cursor-pointer border-none"
          >
            {loading
              ? <><Loader2 size={12} className="animate-spin" /> 요약 생성 중...</>
              : <><Sparkles size={12} /> AI 요약</>
            }
          </button>
        </div>
      )}

      {/* 요약 결과 */}
      {summary && (
        <div className="border-b border-[var(--border-default)] bg-[var(--badge-api-bg)]">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center gap-2 px-6 py-2 text-xs font-medium text-[var(--badge-api-text)] bg-transparent border-none cursor-pointer"
          >
            <Sparkles size={12} />
            <span>AI 요약</span>
            <span className="flex-1" />
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {expanded && (
            <div className="px-6 pb-3 space-y-2">
              <p className="text-xs text-[var(--text-primary)] leading-relaxed m-0">
                {summary.summary}
              </p>
              {summary.keyPoints.length > 0 && (
                <ul className="m-0 pl-4 space-y-0.5">
                  {summary.keyPoints.map((point, i) => (
                    <li key={i} className="text-[11px] text-[var(--text-secondary)]">
                      {point}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────

export function CardFloatingView() {
  const [cardView, setCardView] = useAtom(cardViewAtom)
  const overlayRef = useRef<HTMLDivElement>(null)

  // ESC 키 닫기
  useEffect(() => {
    if (!cardView) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCardView(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cardView, setCardView])

  if (!cardView) return null

  const { item, content } = cardView
  const meta = TYPE_META[item.type]
  const IconComponent = ICON_MAP[item.type]
  const isStructuredType = hasFormFields(item.type)

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) setCardView(null)
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} 조회`}
    >
      <div
        className={`relative flex flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden animate-scale-in ${
          isStructuredType
            ? 'w-fit min-w-[360px] max-w-[min(90vw,600px)] max-h-[85vh]'
            : 'w-[min(90vw,760px)] max-h-[85vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 헤더 ────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: `var(--badge-${meta.colorKey}-bg)`,
                color: `var(--badge-${meta.colorKey}-text)`,
              }}
            >
              <IconComponent size={18} />
            </div>

            <div className="min-w-0">
              <h2 className="text-base font-bold text-[var(--text-primary)] truncate m-0 leading-tight">
                {item.title || '제목 없음'}
              </h2>
              <span
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: `var(--badge-${meta.colorKey}-text)` }}
              >
                {meta.label}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCardView(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none ml-4"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── AI 요약 ───────────────────────── */}
        <AISummarySection content={content} cardType={item.type} />

        {/* ── 본문 ────────────────────────── */}
        <div className="flex-1 overflow-y-auto py-2">
          {item.type === 'custom'
            ? <MarkdownView content={content} />
            : <CardContentView content={content} />
          }
        </div>

        {/* ── 태그 (있을 때만) ──────────────── */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-6 py-3 border-t border-[var(--border-default)] shrink-0">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md px-2 py-0.5 text-xs font-medium bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
