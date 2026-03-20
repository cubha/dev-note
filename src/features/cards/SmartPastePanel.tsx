// src/features/cards/SmartPastePanel.tsx
//
// Smart Paste 패널 — 모든 카드 타입 통합 지원
// - server/db/api/markdown: 텍스트 → Claude AI → 필드 미리보기 → 적용
// - document: 텍스트 → Claude AI → 섹션 구조화 → 미리보기 → 적용
// - Vercel Edge Function 공유 키 모드
// - AI 에러 발생 시 에러 모달 + Discord 관리자 문의

import { useState, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { Clipboard, Sparkles, ChevronDown, ChevronUp, Check, X, Loader2, Send, AlertTriangle } from 'lucide-react'
import type { ItemType } from '../../core/db'
import type { CardField, AnySection } from '../../core/types'
import { FIELD_SCHEMAS } from '../../core/types'
import { AIService, AIError, reportError } from '../../core/ai'
import type { SmartPasteResult, DocumentPasteResult, MarkdownPasteResult, AIErrorCode } from '../../core/ai'
import { SHARED_API_URL } from '../../store/atoms'
import { isErrorAlreadyReported, markErrorReported } from '../../shared/utils/error-report-dedup'

// ─── 타입 ────────────────────────────────────────────────────

interface ParsedField {
  key: string
  value: string
}

interface ErrorDetail {
  code: AIErrorCode
  httpStatus: number
  message: string
  timestamp: string
  reported: boolean
}

interface SmartPasteState {
  status: 'idle' | 'parsing' | 'success' | 'partial' | 'error'
  fields: ParsedField[]
  detectedType: ItemType | null
  suggestedTitle: string
  suggestedTags: string[]
  errorMessage: string
  errorDetail: ErrorDetail | null
  sections: AnySection[] | null
}

/** 정형 카드 적용 데이터 */
export interface FieldApplyData {
  type: ItemType
  title: string
  tags: string[]
  fields: CardField[]
}

/** document 카드 적용 데이터 */
export interface DocumentApplyData {
  title: string
  tags: string[]
  sections: AnySection[]
}

interface SmartPastePanelProps {
  currentType: ItemType
  onApply: (data: FieldApplyData) => void
  onApplyDocument?: (data: DocumentApplyData) => void
}

const INITIAL_STATE: SmartPasteState = {
  status: 'idle',
  fields: [],
  detectedType: null,
  suggestedTitle: '',
  suggestedTags: [],
  errorMessage: '',
  errorDetail: null,
  sections: null,
}

// ─── 에러 코드 → 사용자 메시지 매핑 ─────────────────────────

const ERROR_LABELS: Record<string, string> = {
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

// ─── AI 에러에서 ErrorDetail 추출 ────────────────────────────

function extractErrorDetail(err: unknown): ErrorDetail {
  const timestamp = new Date().toISOString()

  if (err instanceof AIError) {
    return {
      code: err.code,
      httpStatus: err.httpStatus,
      message: err.message,
      timestamp,
      reported: false,
    }
  }

  return {
    code: 'unknown',
    httpStatus: 0,
    message: err instanceof Error ? err.message : '알 수 없는 오류',
    timestamp,
    reported: false,
  }
}

// ─── AI 결과 → AnySection[] 변환 ────────────────────────────

function convertAIResultToSections(result: DocumentPasteResult): AnySection[] {
  return result.sections.map((s) => {
    const id = nanoid(12)
    const base = { id, title: s.title, collapsed: false }

    switch (s.type) {
      case 'markdown':
        return { ...base, type: 'markdown' as const, text: s.content }
      case 'code':
        return { ...base, type: 'code' as const, language: 'text', code: s.content }
      case 'credentials': {
        try {
          const items = JSON.parse(s.content) as Array<{
            label?: string; category?: string; host?: string; port?: string
            username?: string; password?: string; database?: string; extra?: string
          }>
          return {
            ...base, type: 'credentials' as const,
            items: items.map(item => ({
              id: nanoid(8),
              label: item.label ?? '',
              category: (item.category ?? 'server') as 'server' | 'database' | 'other',
              host: item.host ?? '', port: item.port ?? '',
              username: item.username ?? '', password: item.password ?? '',
              database: item.database, extra: item.extra ?? '',
            })),
          }
        } catch {
          return { ...base, type: 'markdown' as const, text: s.content }
        }
      }
      case 'urls': {
        try {
          const items = JSON.parse(s.content) as Array<{
            label?: string; url?: string; method?: string; note?: string
          }>
          return {
            ...base, type: 'urls' as const,
            items: items.map(item => ({
              id: nanoid(8),
              label: item.label ?? '', url: item.url ?? '',
              method: item.method, note: item.note ?? '',
            })),
          }
        } catch {
          return { ...base, type: 'markdown' as const, text: s.content }
        }
      }
      case 'env': {
        try {
          const pairs = JSON.parse(s.content) as Array<{
            key?: string; value?: string; secret?: boolean
          }>
          return {
            ...base, type: 'env' as const,
            pairs: pairs.map(p => ({
              id: nanoid(8), key: p.key ?? '', value: p.value ?? '', secret: p.secret ?? false,
            })),
          }
        } catch {
          return { ...base, type: 'markdown' as const, text: s.content }
        }
      }
      default:
        return { ...base, type: 'markdown' as const, text: s.content }
    }
  })
}

// ─── 섹션 아이콘 ────────────────────────────────────────────

const SECTION_ICON: Record<string, string> = {
  markdown: '\uD83D\uDCDD',
  credentials: '\uD83D\uDD11',
  urls: '\uD83D\uDD17',
  env: '\u2699\uFE0F',
  code: '\uD83D\uDCBB',
}

// ─── 에러 모달 컴포넌트 ──────────────────────────────────────

function SmartPasteErrorModal({
  detail,
  cardType,
  onClose,
  onReported,
}: {
  detail: ErrorDetail
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

  const label = ERROR_LABELS[detail.code] ?? ERROR_LABELS.unknown

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      {/* 모달 */}
      <div
        role="dialog"
        aria-modal
        aria-label="Smart Paste 오류"
        className="fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl animate-scale-in"
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 text-[var(--text-error)]" />
          <h3 className="text-sm font-medium text-[var(--text-primary)]">Smart Paste 오류</h3>
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

        {/* 본문 */}
        <div className="px-4 py-4 space-y-3">
          {/* 에러 유형 배지 */}
          <div className="flex items-center gap-2">
            <span className="rounded bg-[var(--text-error)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--text-error)]">
              {label}
            </span>
            {detail.httpStatus > 0 && (
              <span className="text-[10px] text-[var(--text-placeholder)]">
                HTTP {detail.httpStatus}
              </span>
            )}
          </div>

          {/* 에러 메시지 */}
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {detail.message}
          </p>

          {/* 메타 정보 */}
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

        {/* 푸터 */}
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

// ─── 컴포넌트 ────────────────────────────────────────────────

export function SmartPastePanel({ currentType, onApply, onApplyDocument }: SmartPastePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [inputText, setInputText] = useState('')
  const [state, setState] = useState<SmartPasteState>(INITIAL_STATE)
  const [errorModalDetail, setErrorModalDetail] = useState<ErrorDetail | null>(null)
  const isDocumentMode = currentType === 'document'

  // ── 에러 처리 공통 ─────────────────────────────────────────

  const handleError = useCallback((err: unknown) => {
    const detail = extractErrorDetail(err)
    setState({
      ...INITIAL_STATE,
      status: 'error',
      errorMessage: detail.message,
      errorDetail: detail,
    })
    setErrorModalDetail(detail)
  }, [])

  // ── 분석: markdown 카드 (AI) ────────────────────────────

  const handleAnalyzeMarkdown = useCallback(async (text: string) => {
    try {
      const service = new AIService(SHARED_API_URL!)
      const result: MarkdownPasteResult = await service.markdownSmartPaste(text)

      setState({
        status: 'success',
        fields: [{ key: 'content', value: result.content }],
        detectedType: 'markdown',
        suggestedTitle: result.title,
        suggestedTags: result.suggestedTags,
        errorMessage: '',
        errorDetail: null,
        sections: null,
      })
    } catch (err) {
      handleError(err)
    }
  }, [handleError])

  // ── 분석: 정형 카드 (server/db/api) ──────────────────────

  const handleAnalyzeFields = useCallback(async (text: string) => {
    try {
      const service = new AIService(SHARED_API_URL!)
      const aiResult: SmartPasteResult = await service.smartPaste(text, currentType)

      setState({
        status: aiResult.fields.length >= 2 ? 'success' : 'partial',
        fields: aiResult.fields,
        detectedType: aiResult.detectedType,
        suggestedTitle: aiResult.title,
        suggestedTags: aiResult.suggestedTags,
        errorMessage: '',
        errorDetail: null,
        sections: null,
      })
    } catch (err) {
      handleError(err)
    }
  }, [currentType, handleError])

  // ── 분석: document 카드 ───────────────────────────────────

  const handleAnalyzeDocument = useCallback(async (text: string) => {
    try {
      const service = new AIService(SHARED_API_URL!)
      const result: DocumentPasteResult = await service.documentSmartPaste(text)
      const sections = convertAIResultToSections(result)

      setState({
        status: 'success',
        fields: [],
        detectedType: 'document',
        suggestedTitle: result.title,
        suggestedTags: result.suggestedTags,
        errorMessage: '',
        errorDetail: null,
        sections,
      })
      toast.success(`${sections.length}개 섹션으로 구조화됨`, { duration: 2000 })
    } catch (err) {
      handleError(err)
    }
  }, [handleError])

  // ── 분석 실행 (통합 엔트리포인트) ────────────────────────

  const isMarkdownMode = currentType === 'markdown'

  const handleAnalyze = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return

    setState(prev => ({ ...prev, status: 'parsing', errorMessage: '', errorDetail: null }))

    if (isDocumentMode) {
      await handleAnalyzeDocument(text)
    } else if (isMarkdownMode) {
      await handleAnalyzeMarkdown(text)
    } else {
      await handleAnalyzeFields(text)
    }
  }, [inputText, isDocumentMode, isMarkdownMode, handleAnalyzeDocument, handleAnalyzeMarkdown, handleAnalyzeFields])

  // ── 적용: 정형 카드 ──────────────────────────────────────

  const handleApplyFields = useCallback(() => {
    const targetType = state.detectedType ?? currentType
    const schemas = FIELD_SCHEMAS[targetType]

    const cardFields: CardField[] = schemas.map(schema => {
      const parsed = state.fields.find(f => f.key === schema.key)
      return {
        key: schema.key,
        label: schema.label,
        value: parsed?.value ?? '',
        type: schema.type,
      }
    })

    onApply({
      type: targetType,
      title: state.suggestedTitle,
      tags: state.suggestedTags,
      fields: cardFields,
    })

    setInputText('')
    setState(INITIAL_STATE)
    setExpanded(false)
  }, [state, currentType, onApply])

  // ── 적용: document 카드 ───────────────────────────────────

  const handleApplyDocument = useCallback(() => {
    if (!state.sections || !onApplyDocument) return

    onApplyDocument({
      title: state.suggestedTitle,
      tags: state.suggestedTags,
      sections: state.sections,
    })

    setInputText('')
    setState(INITIAL_STATE)
    setExpanded(false)
  }, [state, onApplyDocument])

  // ── 적용 통합 ────────────────────────────────────────────

  const handleApply = isDocumentMode ? handleApplyDocument : handleApplyFields

  // ── 취소 ─────────────────────────────────────────────────

  const handleCancel = () => {
    setState(INITIAL_STATE)
  }

  // ── 미리보기: 성공 여부 ──────────────────────────────────

  const hasResult = state.status === 'success' || state.status === 'partial'

  // ── 렌더링 ────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-main)]">
      {/* 토글 헤더 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 bg-transparent border-none px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
      >
        <Clipboard size={14} />
        <span>Smart Paste</span>
        <span className="flex-1" />
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* 펼침 영역 */}
      {expanded && (
        <div className="border-t border-[var(--border-default)] px-3 py-3 space-y-3">
          {/* 텍스트 입력 */}
          <textarea
            value={inputText}
            onChange={(e) => { setInputText(e.target.value); if (state.status !== 'idle') setState(INITIAL_STATE) }}
            placeholder={isDocumentMode
              ? '서버 접속 정보, URL, 환경변수 등을 자유롭게 붙여넣으세요...'
              : isMarkdownMode
                ? '메모, 회의록, 정리 내용 등을 붙여넣으면 마크다운으로 정리합니다...'
                : '접속 정보를 붙여넣으세요... (SSH config, DB URI, curl, 또는 자유 텍스트)'
            }
            rows={isDocumentMode ? 5 : 4}
            readOnly={state.status === 'parsing'}
            className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none resize-y transition-colors"
          />

          {/* 분석 버튼 */}
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={state.status === 'parsing' || state.status === 'success' || state.status === 'partial' || !inputText.trim()}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none"
          >
            {state.status === 'parsing' ? (
              <><Loader2 size={12} className="animate-spin" /> {isDocumentMode ? '구조화 중...' : isMarkdownMode ? '정리 중...' : '분석 중...'}</>
            ) : (state.status === 'success' || state.status === 'partial') ? (
              <><Check size={12} /> 변환완료</>
            ) : (
              <><Sparkles size={12} /> {isDocumentMode ? '자동 구조화' : isMarkdownMode ? '마크다운 정리' : '자동 채우기'}</>
            )}
          </button>

          {/* 에러 인라인 메시지 + 상세보기 버튼 */}
          {state.errorMessage && (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[10px] text-[var(--text-error)]">
                {state.errorMessage}
              </p>
              {state.errorDetail && (
                <button
                  type="button"
                  onClick={() => setErrorModalDetail(state.errorDetail)}
                  className="shrink-0 rounded px-2 py-0.5 text-[10px] text-[var(--text-error)] hover:bg-[var(--text-error)]/10 bg-transparent border border-[var(--text-error)]/30 cursor-pointer transition-colors"
                >
                  상세/문의
                </button>
              )}
            </div>
          )}

          {/* 미리보기: markdown 카드 */}
          {hasResult && isMarkdownMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                  변환 결과
                </span>
              </div>

              <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] divide-y divide-[var(--border-default)]">
                {/* 제목 */}
                {state.suggestedTitle && (
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <span className="w-14 shrink-0 text-[10px] text-[var(--text-secondary)]">제목</span>
                    <span className="flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
                      {state.suggestedTitle}
                    </span>
                    <Check size={12} className="shrink-0 text-[var(--text-success)]" />
                  </div>
                )}

                {/* 마크다운 콘텐츠 미리보기 */}
                {state.fields[0]?.value && (
                  <div className="px-3 py-2">
                    <pre className="whitespace-pre-wrap text-[11px] leading-relaxed font-mono text-[var(--text-primary)] max-h-40 overflow-y-auto m-0">
                      {state.fields[0].value.length > 500
                        ? state.fields[0].value.slice(0, 500) + '\n...'
                        : state.fields[0].value}
                    </pre>
                  </div>
                )}

                {/* 태그 */}
                {state.suggestedTags.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <span className="w-14 shrink-0 text-[10px] text-[var(--text-secondary)]">태그</span>
                    <div className="flex flex-wrap gap-1">
                      {state.suggestedTags.map(tag => (
                        <span key={tag} className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 적용/취소 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer border-none transition-colors"
                >
                  <Check size={12} /> 적용
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer bg-transparent border-none transition-colors"
                >
                  <X size={12} /> 취소
                </button>
              </div>
            </div>
          )}

          {/* 미리보기: 정형 카드 */}
          {hasResult && !isDocumentMode && !isMarkdownMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                  추출 결과
                </span>
                {state.detectedType && (
                  <span className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[9px] text-[var(--text-placeholder)]">
                    {state.detectedType}
                  </span>
                )}
              </div>

              <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] divide-y divide-[var(--border-default)]">
                {/* 제목 */}
                {state.suggestedTitle && (
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <span className="w-20 shrink-0 text-[10px] text-[var(--text-secondary)]">제목</span>
                    <span className="flex-1 truncate text-xs font-medium text-[var(--text-primary)]">
                      {state.suggestedTitle}
                    </span>
                    <Check size={12} className="shrink-0 text-[var(--text-success)]" />
                  </div>
                )}

                {/* 필드 목록 */}
                {state.fields.map((field) => (
                  <div key={field.key} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="w-20 shrink-0 text-[10px] text-[var(--text-secondary)]">{field.key}</span>
                    <span className="flex-1 truncate font-mono text-xs text-[var(--text-primary)]">
                      {field.key === 'password' ? '••••••••' : field.value}
                    </span>
                    <Check size={12} className="shrink-0 text-[var(--text-success)]" />
                  </div>
                ))}

                {/* 태그 */}
                {state.suggestedTags.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <span className="w-20 shrink-0 text-[10px] text-[var(--text-secondary)]">태그</span>
                    <span className="flex-1 truncate text-xs text-[var(--text-primary)]">
                      {state.suggestedTags.join(', ')}
                    </span>
                    <Check size={12} className="shrink-0 text-[var(--text-success)]" />
                  </div>
                )}
              </div>

              {/* 적용/취소 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer border-none transition-colors"
                >
                  <Check size={12} /> 모두 적용
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer bg-transparent border-none transition-colors"
                >
                  <X size={12} /> 취소
                </button>
              </div>
            </div>
          )}

          {/* 미리보기: document 카드 */}
          {hasResult && isDocumentMode && state.sections && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                  구조화 결과
                </span>
              </div>

              <div className="rounded-md border border-[var(--border-accent)] bg-[var(--bg-surface)] px-3 py-2 space-y-1">
                {/* 제목 */}
                {state.suggestedTitle && (
                  <div className="flex items-center gap-2 pb-1 mb-1 border-b border-[var(--border-default)]">
                    <span className="text-[10px] text-[var(--text-secondary)]">제목</span>
                    <span className="text-xs font-medium text-[var(--text-primary)]">{state.suggestedTitle}</span>
                  </div>
                )}

                {/* 섹션 리스트 */}
                <p className="text-xs font-medium text-[var(--text-secondary)] m-0">
                  {state.sections.length}개 섹션
                </p>
                {state.sections.map((s) => (
                  <div key={s.id} className="text-[11px] text-[var(--text-tertiary)]">
                    {SECTION_ICON[s.type] ?? ''} {s.title || s.type}
                  </div>
                ))}

                {/* 태그 */}
                {state.suggestedTags.length > 0 && (
                  <div className="flex items-center gap-1 pt-1 mt-1 border-t border-[var(--border-default)]">
                    <span className="text-[10px] text-[var(--text-secondary)]">태그</span>
                    <span className="text-[11px] text-[var(--text-primary)]">{state.suggestedTags.join(', ')}</span>
                  </div>
                )}
              </div>

              {/* 적용/취소 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApply}
                  className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] cursor-pointer border-none transition-colors"
                >
                  <Check size={12} /> 모두 적용
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer bg-transparent border-none transition-colors"
                >
                  <X size={12} /> 취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 에러 모달 */}
      {errorModalDetail && (
        <SmartPasteErrorModal
          detail={errorModalDetail}
          cardType={currentType}
          onClose={() => setErrorModalDetail(null)}
          onReported={() => {
            const updated = { ...errorModalDetail, reported: true }
            setErrorModalDetail(updated)
            setState(prev => prev.errorDetail ? { ...prev, errorDetail: updated } : prev)
          }}
        />
      )}
    </div>
  )
}
