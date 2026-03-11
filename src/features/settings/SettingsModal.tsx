// src/features/settings/SettingsModal.tsx
//
// 환경설정 모달
// 설정 항목: 에디터 글꼴 크기 / 자동 줄바꿈 / 줄 번호 표시 / 테마 / AI 설정

import { useAtom } from 'jotai'
import { useEffect, useCallback, useState } from 'react'
import { db } from '../../core/db'
import { appConfigAtom, settingsOpenAtom, aiApiKeyPersistAtom } from '../../store/atoms'
import { AIService } from '../../core/ai'

export function SettingsModal() {
  const [isOpen, setIsOpen] = useAtom(settingsOpenAtom)
  const [config, setConfig] = useAtom(appConfigAtom)
  const [apiKey, setApiKey] = useAtom(aiApiKeyPersistAtom)

  // AI 설정 로컬 상태
  const [keyInput, setKeyInput] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<'idle' | 'valid' | 'invalid'>('idle')

  // 모달 열릴 때 키 표시용 마스킹 초기화
  useEffect(() => {
    if (isOpen && apiKey) {
      setKeyInput(apiKey)
    } else if (isOpen) {
      setKeyInput('')
    }
    setValidationResult('idle')
    setKeyVisible(false)
  }, [isOpen, apiKey])

  // ESC 키로 닫기
  const handleClose = useCallback(() => setIsOpen(false), [setIsOpen])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, handleClose])

  if (!isOpen || !config) return null

  // ─── 설정 변경 헬퍼 ────────────────────────────────────────

  const update = async (patch: Partial<NonNullable<typeof config>>) => {
    // 낙관적 UI 업데이트
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev))
    // DB 저장
    await db.config.update(1, patch)
  }

  const handleFontSizeChange = (value: number) => {
    void update({ editorFontSize: value })
  }

  const handleWordWrapChange = (enabled: boolean) => {
    void update({ wordWrap: enabled })
  }

  const handleLineNumbersChange = (enabled: boolean) => {
    void update({ showLineNumbers: enabled })
  }

  const handleThemeChange = (theme: 'dark' | 'light') => {
    void update({ theme })
  }

  // ─── AI 키 핸들러 ──────────────────────────────────────────

  const handleSaveApiKey = async () => {
    const trimmed = keyInput.trim()
    if (!trimmed) {
      setApiKey(null)
      setValidationResult('idle')
      return
    }

    setValidating(true)
    setValidationResult('idle')
    try {
      const service = new AIService(trimmed)
      const valid = await service.validateApiKey()
      if (valid) {
        setApiKey(trimmed)
        setValidationResult('valid')
      } else {
        setValidationResult('invalid')
      }
    } catch {
      setValidationResult('invalid')
    } finally {
      setValidating(false)
    }
  }

  const handleRemoveApiKey = () => {
    setApiKey(null)
    setKeyInput('')
    setValidationResult('idle')
  }

  const maskedKey = apiKey
    ? `${apiKey.slice(0, 7)}${'•'.repeat(20)}${apiKey.slice(-4)}`
    : ''

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={handleClose}
        aria-hidden
      />

      {/* 모달 */}
      <div
        role="dialog"
        aria-modal
        aria-label="환경설정"
        className="fixed left-1/2 top-1/2 z-50 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl animate-scale-in"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-3">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">환경설정</h2>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
            aria-label="닫기"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 설정 섹션 */}
        <div className="px-5 py-4 space-y-6">

          {/* ── 화면 섹션 ── */}
          <section>
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              화면
            </h3>
            <div className="space-y-4">

              {/* 테마 */}
              <div className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-[var(--text-primary)]">테마</span>
                <div className="flex gap-2">
                  {(['dark', 'light'] as const).map((t) => (
                    <label
                      key={t}
                      className={`flex cursor-pointer items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${
                        config.theme === t
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--bg-input)] text-[var(--text-primary)] hover:bg-[var(--bg-input-hover)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={t}
                        checked={config.theme === t}
                        onChange={() => handleThemeChange(t)}
                        className="sr-only"
                      />
                      {t === 'dark' ? (
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                          <circle cx="12" cy="12" r="5" />
                          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                        </svg>
                      )}
                      {t === 'dark' ? '다크' : '라이트'}
                    </label>
                  ))}
                </div>
              </div>

            </div>
          </section>

          {/* ── 에디터 섹션 ── */}
          <section>
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              에디터
            </h3>
            <div className="space-y-4">

              {/* 글꼴 크기 */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="settings-font-size"
                  className="w-28 shrink-0 text-sm text-[var(--text-primary)]"
                >
                  글꼴 크기
                </label>
                <div className="flex flex-1 items-center gap-2">
                  <input
                    id="settings-font-size"
                    type="range"
                    min={10}
                    max={24}
                    step={1}
                    value={config.editorFontSize}
                    onChange={(e) => handleFontSizeChange(parseInt(e.target.value))}
                    className="flex-1 accent-[var(--accent)]"
                  />
                  <span className="w-8 text-right text-sm tabular-nums text-[var(--text-primary)]">
                    {config.editorFontSize}
                  </span>
                </div>
              </div>

              {/* 자동 줄바꿈 */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="settings-word-wrap"
                  className="w-28 shrink-0 text-sm text-[var(--text-primary)]"
                >
                  자동 줄바꿈
                </label>
                <button
                  id="settings-word-wrap"
                  type="button"
                  role="switch"
                  aria-checked={config.wordWrap}
                  onClick={() => handleWordWrapChange(!config.wordWrap)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-accent)] ${
                    config.wordWrap ? 'bg-[var(--accent)]' : 'bg-[var(--text-placeholder)]'
                  }`}
                >
                  <span
                    className={`inline-block size-3.5 rounded-full bg-white shadow transition-transform ${
                      config.wordWrap ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className="text-xs text-[var(--text-secondary)]">
                  {config.wordWrap ? '켜짐' : '꺼짐'}
                </span>
              </div>

              {/* 줄 번호 표시 */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="settings-line-numbers"
                  className="w-28 shrink-0 text-sm text-[var(--text-primary)]"
                >
                  줄 번호 표시
                </label>
                <button
                  id="settings-line-numbers"
                  type="button"
                  role="switch"
                  aria-checked={config.showLineNumbers}
                  onClick={() => handleLineNumbersChange(!config.showLineNumbers)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--border-accent)] ${
                    config.showLineNumbers ? 'bg-[var(--accent)]' : 'bg-[var(--text-placeholder)]'
                  }`}
                >
                  <span
                    className={`inline-block size-3.5 rounded-full bg-white shadow transition-transform ${
                      config.showLineNumbers ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className="text-xs text-[var(--text-secondary)]">
                  {config.showLineNumbers ? '켜짐' : '꺼짐'}
                </span>
              </div>

            </div>
          </section>

          {/* ── AI 섹션 ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <svg viewBox="0 0 24 24" className="size-4 text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                AI 설정
              </h3>
              <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                선택적
              </span>
            </div>
            <div className="space-y-3">

              <p className="text-xs text-[var(--text-secondary)]">
                Claude API 키를 입력하면 Smart Paste AI 기능을 사용할 수 있습니다.
                키는 브라우저 세션에만 저장되며, 탭을 닫으면 자동 삭제됩니다.
              </p>

              {apiKey ? (
                // 키가 설정된 상태
                <div className="space-y-2">
                  <div className="flex items-center gap-2 rounded-md bg-[var(--bg-input)] px-3 py-2">
                    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-[var(--text-success)]" fill="none" stroke="currentColor" strokeWidth={2}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="flex-1 truncate font-mono text-xs text-[var(--text-secondary)]">
                      {maskedKey}
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveApiKey}
                      className="shrink-0 rounded px-2 py-0.5 text-[10px] text-[var(--text-error)] hover:bg-[var(--bg-error-hover)]"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ) : (
                // 키 입력 폼
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={keyVisible ? 'text' : 'password'}
                        value={keyInput}
                        onChange={(e) => { setKeyInput(e.target.value); setValidationResult('idle') }}
                        placeholder="sk-ant-..."
                        className="w-full rounded-md border border-[var(--bg-input)] bg-[var(--bg-input)] px-3 py-1.5 pr-8 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setKeyVisible(!keyVisible)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        aria-label={keyVisible ? '숨기기' : '보기'}
                      >
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                          {keyVisible ? (
                            <>
                              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                              <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </>
                          ) : (
                            <>
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </>
                          )}
                        </svg>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleSaveApiKey()}
                      disabled={validating || !keyInput.trim()}
                      className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {validating ? '확인 중...' : '저장'}
                    </button>
                  </div>

                  {validationResult === 'invalid' && (
                    <p className="text-[10px] text-[var(--text-error)]">
                      API 키가 유효하지 않습니다. 키를 확인해주세요.
                    </p>
                  )}
                  {validationResult === 'valid' && (
                    <p className="text-[10px] text-[var(--text-success)]">
                      API 키가 확인되었습니다.
                    </p>
                  )}

                  <p className="text-[10px] text-[var(--text-placeholder)]">
                    <a
                      href="https://console.anthropic.com/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-[var(--text-secondary)]"
                    >
                      Anthropic Console
                    </a>
                    에서 API 키를 발급받을 수 있습니다. Haiku 모델 기준 건당 약 $0.0015입니다.
                  </p>
                </div>
              )}

            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="border-t border-[var(--border-default)] px-5 py-3">
          <p className="text-[10px] text-[var(--text-placeholder)]">변경 사항은 즉시 저장됩니다.</p>
        </div>
      </div>
    </>
  )
}
