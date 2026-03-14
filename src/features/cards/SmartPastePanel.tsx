// src/features/cards/SmartPastePanel.tsx
//
// Smart Paste 패널 — 모든 카드 타입 통합 지원
// - server/db/api/markdown: 텍스트 → Tier 1 정규식 파싱 → 필드 미리보기 → 적용
// - document: 텍스트 → 패턴 감지 → 섹션 구조화 → 미리보기 → 적용
// - AI 활성 시 Tier 2 (Claude API) 폴백
// - 접힘/펼침 토글, 분석 결과 미리보기, 모두 적용/취소

import { useState, useCallback } from 'react'
import { useAtomValue, useAtom } from 'jotai'
import { nanoid } from 'nanoid'
import { toast } from 'sonner'
import { Clipboard, Sparkles, ChevronDown, ChevronUp, Check, X, Loader2, Zap, ExternalLink } from 'lucide-react'
import type { ItemType } from '../../core/db'
import type { CardField, AnySection } from '../../core/types'
import { FIELD_SCHEMAS } from '../../core/types'
import { detectCardType, localSmartParse, generateTitle, detectPatterns, localDocumentParse } from '../../core/smart-paste'
import type { ParsedField } from '../../core/smart-paste'
import { AIService } from '../../core/ai'
import type { SmartPasteResult, DocumentPasteResult } from '../../core/ai'
import { aiApiKeyAtom, aiApiKeyPersistAtom } from '../../store/atoms'

// ─── 타입 ────────────────────────────────────────────────────

interface SmartPasteState {
  status: 'idle' | 'parsing' | 'success' | 'partial' | 'error'
  fields: ParsedField[]
  detectedType: ItemType | null
  suggestedTitle: string
  suggestedTags: string[]
  errorMessage: string
  source: 'tier1' | 'tier2' | null
  // document 모드 전용
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
  source: null,
  sections: null,
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

/** Tier 1 파싱 결과 → AnySection[] 변환 */
function convertTier1ToSections(parsed: ReturnType<typeof localDocumentParse>): AnySection[] {
  return parsed.sections.map(s => {
    const id = nanoid(12)
    switch (s.type) {
      case 'markdown':
        return { id, type: 'markdown' as const, title: '메모', collapsed: false, text: s.content }
      case 'env': {
        const pairs = s.content.split('\n').map(line => {
          const idx = line.indexOf('=')
          return idx > 0
            ? { id: nanoid(8), key: line.slice(0, idx), value: line.slice(idx + 1), secret: false }
            : { id: nanoid(8), key: line, value: '', secret: false }
        })
        return { id, type: 'env' as const, title: '환경변수', collapsed: false, pairs }
      }
      case 'urls': {
        const items = s.content.split('\n').filter(Boolean).map(url => ({
          id: nanoid(8), label: '', url, note: '',
        }))
        return { id, type: 'urls' as const, title: 'URL', collapsed: false, items }
      }
      case 'code':
        return { id, type: 'code' as const, title: '코드', collapsed: false, language: 'text', code: s.content }
      default:
        return { id, type: 'markdown' as const, title: '', collapsed: false, text: s.content }
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

// ─── 컴포넌트 ────────────────────────────────────────────────

export function SmartPastePanel({ currentType, onApply, onApplyDocument }: SmartPastePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [inputText, setInputText] = useState('')
  const [state, setState] = useState<SmartPasteState>(INITIAL_STATE)
  const apiKey = useAtomValue(aiApiKeyAtom)
  const [, setApiKey] = useAtom(aiApiKeyPersistAtom)

  // AI 인라인 설정 상태
  const [showAiSetup, setShowAiSetup] = useState(false)
  const [aiKeyInput, setAiKeyInput] = useState('')
  const [aiKeyValidating, setAiKeyValidating] = useState(false)
  const [aiKeyError, setAiKeyError] = useState('')

  const isDocumentMode = currentType === 'document'

  const handleSaveAiKey = async () => {
    const trimmed = aiKeyInput.trim()
    if (!trimmed) return

    setAiKeyValidating(true)
    setAiKeyError('')
    try {
      const service = new AIService(trimmed)
      const valid = await service.validateApiKey()
      if (valid) {
        setApiKey(trimmed)
        setAiKeyInput('')
        setShowAiSetup(false)
      } else {
        setAiKeyError('API 키가 유효하지 않습니다.')
      }
    } catch {
      setAiKeyError('검증 실패. 키를 확인해주세요.')
    } finally {
      setAiKeyValidating(false)
    }
  }

  const handleRemoveAiKey = () => {
    setApiKey(null)
  }

  // ── 분석: 정형 카드 (server/db/api/markdown) ──────────────

  const handleAnalyzeFields = useCallback(async (text: string) => {
    // Step 1: Tier 1 (정규식)
    // markdown 카드는 타입 자동 감지 없이 항상 markdown으로 처리 (오탐 방지)
    const detectedType = currentType === 'markdown' ? 'markdown' : (detectCardType(text) ?? currentType)
    const tier1Result = localSmartParse(text, detectedType)

    if (tier1Result.hasStructuredMatch && tier1Result.fields.length > 0) {
      const title = generateTitle(detectedType, tier1Result.fields)
      setState({
        status: (detectedType === 'markdown' || tier1Result.fields.length >= 2) ? 'success' : 'partial',
        fields: tier1Result.fields,
        detectedType,
        suggestedTitle: title,
        suggestedTags: [],
        errorMessage: '',
        source: 'tier1',
        sections: null,
      })
      return
    }

    // Step 2: Tier 2 (Claude AI)
    if (apiKey) {
      try {
        const service = new AIService(apiKey)
        const aiResult: SmartPasteResult = await service.smartPaste(text, detectedType !== currentType ? detectedType : undefined)

        const parsedFields: ParsedField[] = aiResult.fields.map(f => ({
          key: f.key,
          value: f.value,
          confidence: aiResult.confidence,
        }))

        setState({
          status: parsedFields.length >= 2 ? 'success' : 'partial',
          fields: parsedFields,
          detectedType: aiResult.detectedType,
          suggestedTitle: aiResult.title,
          suggestedTags: aiResult.suggestedTags,
          errorMessage: '',
          source: 'tier2',
          sections: null,
        })
        return
      } catch (err) {
        if (tier1Result.fields.length > 0) {
          const title = generateTitle(detectedType, tier1Result.fields)
          setState({
            status: 'partial',
            fields: tier1Result.fields,
            detectedType,
            suggestedTitle: title,
            suggestedTags: [],
            errorMessage: `AI 분석 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
            source: 'tier1',
            sections: null,
          })
          return
        }
      }
    }

    // 실패
    setState({
      ...INITIAL_STATE,
      status: 'error',
      errorMessage: '인식 가능한 정보를 찾지 못했습니다. 직접 입력해주세요.',
    })
  }, [currentType, apiKey])

  // ── 분석: document 카드 ───────────────────────────────────

  const handleAnalyzeDocument = useCallback(async (text: string) => {
    const hints = detectPatterns(text)

    if (apiKey) {
      try {
        const service = new AIService(apiKey)
        const result: DocumentPasteResult = await service.documentSmartPaste(text, hints)
        const sections = convertAIResultToSections(result)

        setState({
          status: 'success',
          fields: [],
          detectedType: 'document',
          suggestedTitle: result.title,
          suggestedTags: result.suggestedTags,
          errorMessage: '',
          source: 'tier2',
          sections,
        })
        toast.success(`${sections.length}개 섹션으로 구조화됨 (AI)`, { duration: 2000 })
        return
      } catch (err) {
        // AI 실패 → Tier 1 폴백
        const parsed = localDocumentParse(text, hints)
        const sections = convertTier1ToSections(parsed)

        setState({
          status: 'partial',
          fields: [],
          detectedType: 'document',
          suggestedTitle: parsed.title,
          suggestedTags: [],
          errorMessage: `AI 분석 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`,
          source: 'tier1',
          sections,
        })
        toast.success(`${sections.length}개 섹션으로 구조화됨 (Tier 1)`, { duration: 2000 })
        return
      }
    }

    // Tier 1만
    const parsed = localDocumentParse(text, hints)
    const sections = convertTier1ToSections(parsed)

    setState({
      status: sections.length > 0 ? 'success' : 'partial',
      fields: [],
      detectedType: 'document',
      suggestedTitle: parsed.title,
      suggestedTags: [],
      errorMessage: '',
      source: 'tier1',
      sections,
    })
    toast.success(`${sections.length}개 섹션으로 구조화됨 (Tier 1)`, { duration: 2000 })
  }, [apiKey])

  // ── 분석 실행 (통합 엔트리포인트) ────────────────────────

  const handleAnalyze = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return

    setState(prev => ({ ...prev, status: 'parsing', errorMessage: '' }))

    if (isDocumentMode) {
      await handleAnalyzeDocument(text)
    } else {
      await handleAnalyzeFields(text)
    }
  }, [inputText, isDocumentMode, handleAnalyzeDocument, handleAnalyzeFields])

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
        {apiKey ? (
          <span className="flex items-center gap-1 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[9px] font-medium text-[var(--accent)]">
            <Zap size={9} />
            AI 활성
          </span>
        ) : (
          <span className="rounded-full bg-[var(--bg-input)] px-2 py-0.5 text-[9px] text-[var(--text-placeholder)]">
            정규식만
          </span>
        )}
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
              : '접속 정보를 붙여넣으세요... (SSH config, DB URI, curl, 또는 자유 텍스트)'
            }
            rows={isDocumentMode ? 5 : 4}
            readOnly={state.status === 'parsing'}
            className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none resize-y transition-colors"
          />

          {/* AI 활성화 토글 */}
          <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap size={13} className={apiKey ? 'text-[var(--accent)]' : 'text-[var(--text-placeholder)]'} />
                <span className="text-[11px] font-medium text-[var(--text-primary)]">AI 분석</span>
                {apiKey ? (
                  <span className="text-[10px] text-[var(--text-success)]">연결됨</span>
                ) : (
                  <span className="text-[10px] text-[var(--text-placeholder)]">비활성</span>
                )}
              </div>
              {apiKey ? (
                <button
                  type="button"
                  onClick={handleRemoveAiKey}
                  className="rounded px-2 py-0.5 text-[10px] text-[var(--text-error)] hover:bg-[var(--bg-error-hover)] bg-transparent border-none cursor-pointer"
                >
                  연결 해제
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAiSetup(!showAiSetup)}
                  className="flex items-center gap-1 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[var(--accent-hover)] border-none cursor-pointer transition-colors"
                >
                  <Zap size={10} />
                  {showAiSetup ? '닫기' : 'API 키 입력'}
                </button>
              )}
            </div>

            {/* 인라인 API 키 입력 폼 */}
            {!apiKey && showAiSetup && (
              <div className="mt-2.5 space-y-2 border-t border-[var(--border-default)] pt-2.5">
                <p className="text-[10px] text-[var(--text-secondary)]">
                  Claude API 키를 입력하면 정규식 파싱 실패 시 AI가 자동으로 분석합니다.
                  키는 세션에만 저장되며, 탭을 닫으면 삭제됩니다.
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="password"
                    value={aiKeyInput}
                    onChange={(e) => { setAiKeyInput(e.target.value); setAiKeyError('') }}
                    placeholder="sk-ant-..."
                    className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveAiKey()}
                    disabled={aiKeyValidating || !aiKeyInput.trim()}
                    className="shrink-0 rounded bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer transition-colors"
                  >
                    {aiKeyValidating ? '확인 중...' : '연결'}
                  </button>
                </div>
                {aiKeyError && (
                  <p className="text-[10px] text-[var(--text-error)]">{aiKeyError}</p>
                )}
                <p className="text-[9px] text-[var(--text-placeholder)]">
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 underline hover:text-[var(--text-secondary)]"
                  >
                    Anthropic Console <ExternalLink size={8} />
                  </a>
                  에서 키를 발급받으세요. 건당 약 $0.0015 (Haiku)
                </p>
              </div>
            )}
          </div>

          {/* 분석 버튼 */}
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={state.status === 'parsing' || !inputText.trim()}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none"
          >
            {state.status === 'parsing' ? (
              <><Loader2 size={12} className="animate-spin" /> {isDocumentMode ? '구조화 중...' : '분석 중...'}</>
            ) : (
              <><Sparkles size={12} /> {isDocumentMode ? '자동 구조화' : '자동 채우기'}</>
            )}
          </button>

          {/* AI 전송 안내 */}
          {apiKey && state.status === 'idle' && (
            <p className="text-[9px] text-[var(--text-placeholder)]">
              {isDocumentMode
                ? '텍스트를 AI가 분석하여 섹션(마크다운/접속정보/URL/환경변수/코드)으로 자동 분리합니다.'
                : '정규식으로 파싱 실패 시 텍스트가 AI 서비스(Claude)로 전송됩니다.'
              }
            </p>
          )}

          {/* 에러 메시지 */}
          {state.errorMessage && (
            <p className={`text-[10px] ${state.status === 'error' ? 'text-[var(--text-error)]' : 'text-[var(--text-warning)]'}`}>
              {state.errorMessage}
            </p>
          )}

          {/* 미리보기: 정형 카드 */}
          {hasResult && !isDocumentMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                  추출 결과
                </span>
                <span className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[9px] text-[var(--text-placeholder)]">
                  {state.source === 'tier2' ? 'AI' : '정규식'}
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
                <span className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[9px] text-[var(--text-placeholder)]">
                  {state.source === 'tier2' ? 'AI' : 'Tier 1'}
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
    </div>
  )
}
