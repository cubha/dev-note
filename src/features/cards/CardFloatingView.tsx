import { useEffect, useRef, useState, useCallback } from 'react'
import { useAtom } from 'jotai'
import {
  Terminal, Database, FileText, X, Sparkles, Loader2, ChevronDown, ChevronUp,
  ChevronRight, Shield, Link, Code, Eye, EyeOff, ExternalLink, Server, HardDrive, Copy,
  AlertTriangle, Send, Check,
} from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { toast } from 'sonner'
import { cardViewAtom, SHARED_API_URL } from '../../store/atoms'
import { TYPE_META } from '../../core/types'
import type {
  CardContent as CardContentType,
  HybridContent, AnySection, SectionType,
  MarkdownSection, CredentialSection, UrlSection, EnvSection, CodeSection,
  CredentialEntry, EnvEntry,
} from '../../core/types'
import type { ItemType } from '../../core/db'
import { extractSearchText } from '../../core/content'
import { AIService, AIError, reportError } from '../../core/ai'
import type { SummaryResult, AIErrorCode } from '../../core/ai'
import { CardContentView } from './CardContent'
import { hasFormFields } from './fieldHelpers'
import { copyToClipboard } from '../../shared/utils/clipboard'
import { ICON_MAP } from '../../shared/constants'
import { isSafeUrl } from '../../shared/utils/url'
import { isErrorAlreadyReported, markErrorReported } from '../../shared/utils/error-report-dedup'

// ── 마크다운 렌더링 뷰 (markdown 타입 전용) ──────────────────

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

// ── AI 요약 에러 타입 ────────────────────────────────────────

interface SummaryErrorDetail {
  code: AIErrorCode
  httpStatus: number
  message: string
  timestamp: string
  reported: boolean
}

const SUMMARY_ERROR_LABELS: Record<string, string> = {
  auth_error: 'API 키 오류',
  permission_error: 'API 권한 부족',
  credit_exhausted: '크레딧 소진',
  daily_limit_exceeded: '일일 사용 한도 초과',
  anthropic_rate_limit: 'API 호출 한도 초과',
  overloaded: '서버 과부하',
  input_too_long: '입력 텍스트 초과',
  invalid_request: '잘못된 요청',
  invalid_model: '지원하지 않는 모델',
  parse_error: '요청 파싱 오류',
  network_error: '네트워크 연결 실패',
  unknown: '알 수 없는 오류',
}

// ── AI 요약 에러 모달 ────────────────────────────────────────

function AISummaryErrorModal({
  detail,
  cardType,
  onClose,
  onReported,
}: {
  detail: SummaryErrorDetail
  cardType: ItemType
  onClose: () => void
  onReported: () => void
}) {
  const [sending, setSending] = useState(false)
  const alreadyReported = detail.reported || isErrorAlreadyReported(detail.code)

  const handleReport = async () => {
    if (!SHARED_API_URL || alreadyReported) return
    setSending(true)
    const ok = await reportError(SHARED_API_URL, {
      code: detail.code,
      status: detail.httpStatus,
      message: detail.message,
      cardType,
      timestamp: detail.timestamp,
    })
    setSending(false)
    if (ok) {
      markErrorReported(detail.code)
      onReported()
      toast.success('오류 리포트가 전송되었습니다.', { duration: 3000 })
    } else {
      toast.error('리포트 전송에 실패했습니다.', { duration: 3000 })
    }
  }

  const label = SUMMARY_ERROR_LABELS[detail.code] ?? SUMMARY_ERROR_LABELS.unknown

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/50" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal
        aria-label="AI 요약 오류"
        className="fixed left-1/2 top-1/2 z-[70] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl animate-scale-in"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 text-[var(--text-error)]" />
          <h3 className="text-sm font-medium text-[var(--text-primary)]">AI 요약 오류</h3>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-[var(--text-error)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--text-error)]">
              {label}
            </span>
            {detail.httpStatus > 0 && (
              <span className="text-[10px] text-[var(--text-placeholder)]">HTTP {detail.httpStatus}</span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{detail.message}</p>
          <div className="rounded-md bg-[var(--bg-input)] px-3 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-placeholder)]">에러 코드</span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">{detail.code}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-placeholder)]">시각</span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                {new Date(detail.timestamp).toLocaleString('ko-KR')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--border-default)] px-4 py-3">
          <button
            type="button"
            onClick={() => void handleReport()}
            disabled={sending || alreadyReported || !SHARED_API_URL}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none"
          >
            {sending ? (
              <><Loader2 size={12} className="animate-spin" /> 전송 중...</>
            ) : alreadyReported ? (
              <><Check size={12} /> 전송 완료</>
            ) : (
              <><Send size={12} /> 관리자에게 전송</>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer bg-transparent border-none transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </>
  )
}

// ── AI 요약 섹션 ─────────────────────────────────────────────

function AISummarySection({ content, cardType }: { content: CardContentType; cardType: ItemType }) {
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [errorDetail, setErrorDetail] = useState<SummaryErrorDetail | null>(null)
  const [errorModalOpen, setErrorModalOpen] = useState(false)

  const handleSummarize = useCallback(async () => {
    setLoading(true)
    setErrorDetail(null)
    try {
      const service = new AIService(SHARED_API_URL!)
      const text = extractSearchText(content)
      if (!text.trim()) {
        toast.error('요약할 콘텐츠가 없습니다.')
        return
      }
      const result = await service.summarize(text, cardType)
      setSummary(result)
      setExpanded(true)
    } catch (err) {
      const timestamp = new Date().toISOString()
      const detail: SummaryErrorDetail = err instanceof AIError
        ? { code: err.code, httpStatus: err.httpStatus, message: err.message, timestamp, reported: false }
        : { code: 'unknown', httpStatus: 0, message: err instanceof Error ? err.message : '알 수 없는 오류', timestamp, reported: false }
      setErrorDetail(detail)
      setErrorModalOpen(true)
    } finally {
      setLoading(false)
    }
  }, [content, cardType])

  return (
    <div className="shrink-0">
      {!summary && (
        <div className="px-6 py-2 border-b border-[var(--border-default)] space-y-1.5">
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
          {errorDetail && (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[10px] text-[var(--text-error)]">{errorDetail.message}</p>
              <button
                type="button"
                onClick={() => setErrorModalOpen(true)}
                className="shrink-0 rounded px-2 py-0.5 text-[10px] text-[var(--text-error)] hover:bg-[var(--text-error)]/10 bg-transparent border border-[var(--text-error)]/30 cursor-pointer transition-colors"
              >
                상세/문의
              </button>
            </div>
          )}
        </div>
      )}

      {errorModalOpen && errorDetail && (
        <AISummaryErrorModal
          detail={errorDetail}
          cardType={cardType}
          onClose={() => setErrorModalOpen(false)}
          onReported={() => {
            const updated = { ...errorDetail, reported: true }
            setErrorDetail(updated)
            setErrorModalOpen(false)
          }}
        />
      )}

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

// ── HybridDocumentView — Document 타입 읽기 전용 렌더러 ──────

const SECTION_ICONS_VIEW: Record<SectionType, React.ComponentType<{ size?: number; className?: string }>> = {
  credentials: Shield,
  urls: Link,
  env: Terminal,
  code: Code,
  markdown: FileText,
}

const SECTION_LABELS_VIEW: Record<SectionType, string> = {
  credentials: '접속 정보',
  urls: 'URL',
  env: '환경변수',
  code: '코드',
  markdown: '메모',
}

const CATEGORY_ICONS_VIEW: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Server,
  database: Database,
  other: HardDrive,
}

// ── 섹션별 읽기 전용 렌더러 ──────────────────────────────────

function ReadOnlyMarkdown({ section }: { section: MarkdownSection }) {
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (!section.text) { setHtml(''); return }
    const result = marked.parse(section.text) as string
    setHtml(DOMPurify.sanitize(result))
  }, [section.text])

  if (!section.text) {
    return <p className="text-sm text-[var(--text-placeholder)] italic m-0">내용이 없습니다</p>
  }

  return (
    <div
      className="md-preview text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function ReadOnlyCredentialCard({ entry }: { entry: CredentialEntry }) {
  const [showPw, setShowPw] = useState(false)
  const CatIcon = CATEGORY_ICONS_VIEW[entry.category] ?? HardDrive
  const addrText = entry.host
    ? `${entry.username ? entry.username + '@' : ''}${entry.host}${entry.port ? ':' + entry.port : ''}`
    : entry.label

  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <CatIcon size={13} className="text-[var(--text-tertiary)] shrink-0" />
        <span className="text-xs font-medium text-[var(--text-primary)] flex-1 truncate">
          {entry.label || '(라벨 없음)'}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-tertiary)]">
          {entry.category === 'server' ? '서버' : entry.category === 'database' ? 'DB' : '기타'}
        </span>
      </div>

      {addrText && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)] w-16 shrink-0">주소</span>
          <span className="text-xs font-mono text-[var(--text-secondary)] flex-1 truncate">{addrText}</span>
          <button
            type="button"
            onClick={() => void copyToClipboard(addrText, '주소')}
            className="p-0.5 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
          >
            <Copy size={11} />
          </button>
        </div>
      )}

      {entry.password && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)] w-16 shrink-0">비밀번호</span>
          <span className="text-xs font-mono text-[var(--text-secondary)] flex-1">
            {showPw ? entry.password : '••••••••'}
          </span>
          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            className="p-0.5 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
          >
            {showPw ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
          <button
            type="button"
            onClick={() => void copyToClipboard(entry.password, '비밀번호')}
            className="p-0.5 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
          >
            <Copy size={11} />
          </button>
        </div>
      )}

      {entry.category === 'database' && entry.database && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)] w-16 shrink-0">DB명</span>
          <span className="text-xs font-mono text-[var(--text-secondary)] flex-1">{entry.database}</span>
        </div>
      )}

      {entry.extra && (
        <div className="flex items-start gap-2">
          <span className="text-[10px] text-[var(--text-tertiary)] w-16 shrink-0 pt-0.5">비고</span>
          <span className="text-xs text-[var(--text-tertiary)] flex-1">{entry.extra}</span>
        </div>
      )}
    </div>
  )
}

function ReadOnlyCredentials({ section }: { section: CredentialSection }) {
  if (section.items.length === 0) {
    return <p className="text-sm text-[var(--text-placeholder)] italic m-0">항목 없음</p>
  }
  return (
    <div className="space-y-3">
      {section.items.map((entry) => (
        <ReadOnlyCredentialCard key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function ReadOnlyUrls({ section }: { section: UrlSection }) {
  if (section.items.length === 0) {
    return <p className="text-sm text-[var(--text-placeholder)] italic m-0">URL 없음</p>
  }
  return (
    <div className="space-y-3 divide-y divide-[var(--border-default)]">
      {section.items.map((entry) => {
        const noteCards = entry.noteCards ?? []
        const hasExtra = entry.note || noteCards.length > 0
        return (
          <div key={entry.id} className="pt-3 first:pt-0 space-y-1.5">
            {/* 상단: 라벨 + URL + 복사/열기 */}
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0 space-y-0.5">
                {(entry.label || entry.method) && (
                  <div className="flex items-center gap-2">
                    {entry.label && (
                      <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {entry.label}
                      </span>
                    )}
                    {entry.method && (
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-[var(--badge-api-bg)] text-[var(--badge-api-text)]">
                        {entry.method}
                      </span>
                    )}
                  </div>
                )}
                <div className="text-xs font-mono text-[var(--text-secondary)] truncate">{entry.url}</div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                {isSafeUrl(entry.url) && (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-active)] cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void copyToClipboard(entry.url, 'URL')}
                  className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
                >
                  <Copy size={12} />
                </button>
              </div>
            </div>

            {/* 메모 영역 (note + noteCards) */}
            {hasExtra && (
              <div className="pl-2 border-l-2 border-[var(--border-subtle)] space-y-1.5">
                {entry.note && (
                  <p className="text-[11px] text-[var(--text-tertiary)] whitespace-pre-wrap m-0 leading-relaxed">
                    {entry.note}
                  </p>
                )}
                {noteCards.map((card) => (
                  <div
                    key={card.id}
                    className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 py-2 space-y-1"
                  >
                    {card.title && (
                      <p className="text-[10px] font-semibold text-[var(--text-secondary)] m-0">
                        {card.title}
                      </p>
                    )}
                    {card.text && (
                      <p className="text-[10px] font-mono text-[var(--text-primary)] whitespace-pre-wrap m-0 leading-relaxed">
                        {card.text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ReadOnlyEnvRow({ entry }: { entry: EnvEntry }) {
  const [showVal, setShowVal] = useState(!entry.secret)

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-32 shrink-0 rounded px-2 py-1 text-xs font-mono font-medium text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border-default)] truncate">
        {entry.key || '(빈 키)'}
      </span>
      <span className="text-[10px] text-[var(--text-placeholder)]">=</span>
      <span className="flex-1 min-w-0 rounded px-2 py-1 text-xs font-mono text-[var(--text-secondary)] bg-[var(--bg-input)] border border-[var(--border-default)] truncate">
        {entry.secret && !showVal ? '••••••••' : (entry.value || '(빈 값)')}
      </span>
      {entry.secret && (
        <button
          type="button"
          onClick={() => setShowVal((s) => !s)}
          className="p-1 text-[var(--text-warning)] cursor-pointer bg-transparent border-none shrink-0"
        >
          {showVal ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}
      <button
        type="button"
        onClick={() => void copyToClipboard(`${entry.key}=${entry.value}`, entry.key)}
        className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none shrink-0"
      >
        <Copy size={12} />
      </button>
    </div>
  )
}

function ReadOnlyEnv({ section }: { section: EnvSection }) {
  if (section.pairs.length === 0) {
    return <p className="text-sm text-[var(--text-placeholder)] italic m-0">환경변수 없음</p>
  }
  return (
    <div className="space-y-1.5">
      {section.pairs.map((entry) => (
        <ReadOnlyEnvRow key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function ReadOnlyCode({ section }: { section: CodeSection }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-default)]">
          {section.language}
        </span>
        <button
          type="button"
          onClick={() => void copyToClipboard(section.code, '코드')}
          className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
        >
          <Copy size={12} />
        </button>
      </div>
      <pre className="rounded-md bg-[var(--bg-input)] border border-[var(--border-default)] px-3 py-2.5 text-xs font-mono text-[var(--text-editor)] overflow-x-auto max-h-64 leading-relaxed m-0 whitespace-pre-wrap">
        <code>{section.code || '(비어 있음)'}</code>
      </pre>
    </div>
  )
}

function ReadOnlySectionContent({ section }: { section: AnySection }) {
  switch (section.type) {
    case 'markdown':     return <ReadOnlyMarkdown section={section} />
    case 'credentials':  return <ReadOnlyCredentials section={section} />
    case 'urls':         return <ReadOnlyUrls section={section} />
    case 'env':          return <ReadOnlyEnv section={section} />
    case 'code':         return <ReadOnlyCode section={section} />
    default: {
      const _exhaustive: never = section
      throw new Error(`Unhandled section type: ${(_exhaustive as AnySection).type}`)
    }
  }
}

function ReadOnlySectionBlock({ section }: { section: AnySection }) {
  const [collapsed, setCollapsed] = useState(section.collapsed)
  const Icon = SECTION_ICONS_VIEW[section.type]

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-3 py-2 bg-[var(--bg-surface-hover)] text-left cursor-pointer border-none hover:bg-[var(--bg-input)] transition-colors"
      >
        <Icon size={14} className="text-[var(--text-tertiary)] shrink-0" />
        <span className="flex-1 text-xs font-medium text-[var(--text-secondary)] truncate">
          {section.title || SECTION_LABELS_VIEW[section.type]}
        </span>
        {collapsed
          ? <ChevronRight size={14} className="text-[var(--text-tertiary)] shrink-0" />
          : <ChevronDown size={14} className="text-[var(--text-tertiary)] shrink-0" />
        }
      </button>

      {!collapsed && (
        <div className="px-3 py-3">
          <ReadOnlySectionContent section={section} />
        </div>
      )}
    </div>
  )
}

function HybridDocumentView({ content }: { content: HybridContent }) {
  if (content.sections.length === 0) {
    return (
      <div className="flex h-full items-center justify-center py-8">
        <p className="text-sm text-[var(--text-placeholder)]">섹션이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 space-y-2">
      {content.sections.map((section) => (
        <ReadOnlySectionBlock key={section.id} section={section} />
      ))}
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

        {/* ── 본문 (AI 요약 포함) ──────────── */}
        <div className="flex-1 overflow-y-auto">
          <AISummarySection content={content} cardType={item.type} />
          <div className="py-2">
            {item.type === 'markdown'
              ? <MarkdownView content={content} />
              : item.type === 'document' && content.format === 'hybrid'
                ? <HybridDocumentView content={content} />
                : <CardContentView content={content} />
            }
          </div>
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
