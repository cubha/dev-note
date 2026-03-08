// src/features/cards/SmartPastePanel.tsx
//
// Smart Paste 패널 — CardFormModal 상단에 통합
// - 텍스트 입력 → Tier 1 (정규식) 파싱 → 필드 미리보기 → 적용
// - AI 활성 시 Tier 2 (Claude API) 폴백
// - 접힘/펼침 토글, 분석 결과 미리보기, 모두 적용/취소

import { useState, useCallback } from 'react'
import { useAtomValue } from 'jotai'
import { Clipboard, Sparkles, ChevronDown, ChevronUp, Check, X, Loader2 } from 'lucide-react'
import type { ItemType } from '../../core/db'
import type { CardField } from '../../core/types'
import { FIELD_SCHEMAS } from '../../core/types'
import { detectCardType, localSmartParse, generateTitle } from '../../core/smart-paste'
import type { ParsedField } from '../../core/smart-paste'
import { AIService } from '../../core/ai'
import type { SmartPasteResult } from '../../core/ai'
import { aiApiKeyAtom } from '../../store/atoms'

// ─── 타입 ────────────────────────────────────────────────────

interface SmartPasteState {
  status: 'idle' | 'parsing' | 'success' | 'partial' | 'error'
  fields: ParsedField[]
  detectedType: ItemType | null
  suggestedTitle: string
  suggestedTags: string[]
  errorMessage: string
  source: 'tier1' | 'tier2' | null
}

interface SmartPastePanelProps {
  currentType: ItemType
  onApply: (data: {
    type: ItemType
    title: string
    tags: string[]
    fields: CardField[]
  }) => void
}

const INITIAL_STATE: SmartPasteState = {
  status: 'idle',
  fields: [],
  detectedType: null,
  suggestedTitle: '',
  suggestedTags: [],
  errorMessage: '',
  source: null,
}

// ─── 컴포넌트 ────────────────────────────────────────────────

export function SmartPastePanel({ currentType, onApply }: SmartPastePanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [inputText, setInputText] = useState('')
  const [state, setState] = useState<SmartPasteState>(INITIAL_STATE)
  const apiKey = useAtomValue(aiApiKeyAtom)

  // ── 분석 실행 ──────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return

    setState(prev => ({ ...prev, status: 'parsing', errorMessage: '' }))

    // Step 1: Tier 1 (정규식)
    const detectedType = detectCardType(text) ?? currentType
    const tier1Result = localSmartParse(text, detectedType)

    if (tier1Result.hasStructuredMatch && tier1Result.fields.length > 0) {
      const title = generateTitle(detectedType, tier1Result.fields)
      setState({
        status: tier1Result.fields.length >= 2 ? 'success' : 'partial',
        fields: tier1Result.fields,
        detectedType,
        suggestedTitle: title,
        suggestedTags: [],
        errorMessage: '',
        source: 'tier1',
      })
      return
    }

    // Step 2: Tier 2 (Claude AI) — API 키 있을 때만
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
        })
        return
      } catch (err) {
        // AI 실패 → Tier 1 결과가 있으면 그것이라도 사용
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
          })
          return
        }
      }
    }

    // 아무것도 파싱 못한 경우
    setState({
      ...INITIAL_STATE,
      status: 'error',
      errorMessage: '인식 가능한 정보를 찾지 못했습니다. 직접 입력해주세요.',
    })
  }, [inputText, currentType, apiKey])

  // ── 적용 ───────────────────────────────────────────────────

  const handleApply = useCallback(() => {
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

    // 초기화
    setInputText('')
    setState(INITIAL_STATE)
    setExpanded(false)
  }, [state, currentType, onApply])

  // ── 취소 ───────────────────────────────────────────────────

  const handleCancel = () => {
    setState(INITIAL_STATE)
  }

  // ── 렌더링 ─────────────────────────────────────────────────

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
        {apiKey && (
          <span className="rounded bg-[var(--badge-api-bg)] px-1.5 py-0.5 text-[9px] text-[var(--badge-api-text)]">
            AI
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
            placeholder="접속 정보를 붙여넣으세요... (SSH config, DB URI, curl, 또는 자유 텍스트)"
            rows={4}
            readOnly={state.status === 'parsing'}
            className="w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none resize-y transition-colors"
          />

          {/* 분석 버튼 */}
          <button
            type="button"
            onClick={() => void handleAnalyze()}
            disabled={state.status === 'parsing' || !inputText.trim()}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none"
          >
            {state.status === 'parsing' ? (
              <><Loader2 size={12} className="animate-spin" /> 분석 중...</>
            ) : (
              <><Sparkles size={12} /> 자동 채우기</>
            )}
          </button>

          {/* AI 전송 안내 */}
          {apiKey && state.status === 'idle' && (
            <p className="text-[9px] text-[var(--text-placeholder)]">
              정규식으로 파싱 실패 시 텍스트가 AI 서비스(Claude)로 전송됩니다.
            </p>
          )}

          {/* 에러 메시지 */}
          {state.errorMessage && (
            <p className={`text-[10px] ${state.status === 'error' ? 'text-[var(--text-error)]' : 'text-[var(--text-warning)]'}`}>
              {state.errorMessage}
            </p>
          )}

          {/* 미리보기 */}
          {(state.status === 'success' || state.status === 'partial') && (
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
        </div>
      )}
    </div>
  )
}
