// src/features/settings/SettingsModal.tsx
//
// 환경설정 모달
// 탭: 일반 (테마, 에디터) | 단축키

import { useAtom } from 'jotai'
import { useEffect, useCallback, useState } from 'react'
import { db } from '../../core/db'
import { appConfigAtom, settingsOpenAtom } from '../../store/atoms'
import { KeybindingsTab } from './KeybindingsTab'

type SettingsTab = 'general' | 'keybindings'

export function SettingsModal() {
  const [isOpen, setIsOpen] = useAtom(settingsOpenAtom)
  const [config, setConfig] = useAtom(appConfigAtom)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

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

  // 모달 닫힐 때 탭 초기화
  useEffect(() => {
    if (!isOpen) setActiveTab('general')
  }, [isOpen])

  if (!isOpen || !config) return null

  // ─── 설정 변경 헬퍼 ────────────────────────────────────────

  const update = async (patch: Partial<NonNullable<typeof config>>) => {
    setConfig((prev) => (prev ? { ...prev, ...patch } : prev))
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
        className="fixed left-1/2 top-1/2 z-50 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl animate-scale-in"
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

        {/* 탭 네비게이션 */}
        <div className="flex border-b border-[var(--border-default)] px-5">
          {(['general', 'keybindings'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`-mb-px mr-4 border-b-2 pb-2 pt-2.5 text-xs font-medium transition-colors ${
                activeTab === tab
                  ? 'border-[var(--accent)] text-[var(--text-primary)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab === 'general' ? '일반' : '단축키'}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {activeTab === 'general' ? (
            <div className="space-y-6">

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

            </div>
          ) : (
            <KeybindingsTab />
          )}
        </div>

        {/* 푸터 */}
        <div className="border-t border-[var(--border-default)] px-5 py-3">
          <p className="text-[10px] text-[var(--text-placeholder)]">변경 사항은 즉시 저장됩니다.</p>
        </div>
      </div>
    </>
  )
}
