// src/features/settings/SettingsModal.tsx
//
// 환경설정 모달
// 설정 항목: 에디터 글꼴 크기 / 자동 줄바꿈 / 탭 크기
// 변경 즉시 DB 저장 + appConfigAtom 낙관적 업데이트

import { useAtom } from 'jotai'
import { useEffect, useCallback } from 'react'
import { db } from '../../core/db'
import { appConfigAtom, settingsOpenAtom } from '../../store/atoms'

export function SettingsModal() {
  const [isOpen, setIsOpen] = useAtom(settingsOpenAtom)
  const [config, setConfig] = useAtom(appConfigAtom)

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

  const handleTabSizeChange = (size: 2 | 4) => {
    void update({ tabSize: size })
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
        className="fixed left-1/2 top-1/2 z-50 w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#454545] bg-[#252526] shadow-2xl"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[#2d2d2d] px-5 py-3">
          <h2 className="text-sm font-medium text-[#cccccc]">환경설정</h2>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center rounded p-1 text-[#858585] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
            aria-label="닫기"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 설정 섹션 */}
        <div className="px-5 py-4 space-y-5">

          {/* ── 에디터 섹션 ── */}
          <section>
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[#858585]">
              에디터
            </h3>
            <div className="space-y-4">

              {/* 글꼴 크기 */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="settings-font-size"
                  className="w-24 shrink-0 text-sm text-[#cccccc]"
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
                    className="flex-1 accent-[#007acc]"
                  />
                  <span className="w-8 text-right text-sm tabular-nums text-[#cccccc]">
                    {config.editorFontSize}
                  </span>
                </div>
              </div>

              {/* 탭 크기 */}
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-[#cccccc]">탭 크기</span>
                <div className="flex gap-2">
                  {([2, 4] as const).map((size) => (
                    <label
                      key={size}
                      className={`flex cursor-pointer items-center gap-1.5 rounded px-3 py-1 text-sm transition-colors ${
                        config.tabSize === size
                          ? 'bg-[#007acc] text-white'
                          : 'bg-[#3c3c3c] text-[#cccccc] hover:bg-[#4a4a4a]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tab-size"
                        value={size}
                        checked={config.tabSize === size}
                        onChange={() => handleTabSizeChange(size)}
                        className="sr-only"
                      />
                      {size}칸
                    </label>
                  ))}
                </div>
              </div>

              {/* 자동 줄바꿈 */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="settings-word-wrap"
                  className="w-24 shrink-0 text-sm text-[#cccccc]"
                >
                  자동 줄바꿈
                </label>
                <button
                  id="settings-word-wrap"
                  type="button"
                  role="switch"
                  aria-checked={config.wordWrap}
                  onClick={() => handleWordWrapChange(!config.wordWrap)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007acc] ${
                    config.wordWrap ? 'bg-[#007acc]' : 'bg-[#555]'
                  }`}
                >
                  <span
                    className={`inline-block size-3.5 rounded-full bg-white shadow transition-transform ${
                      config.wordWrap ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className="text-xs text-[#858585]">
                  {config.wordWrap ? '켜짐' : '꺼짐'}
                </span>
              </div>

            </div>
          </section>
        </div>

        {/* 푸터 */}
        <div className="border-t border-[#2d2d2d] px-5 py-3">
          <p className="text-[10px] text-[#555]">변경 사항은 즉시 저장됩니다.</p>
        </div>
      </div>
    </>
  )
}
