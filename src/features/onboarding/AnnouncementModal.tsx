// src/features/onboarding/AnnouncementModal.tsx
//
// 공지사항 + 릴리즈노트 모달
// - 앱 초기화 시 자동 표시 (24시간 dismiss)
// - "사용방법 보기" → GuideModal 연동

import { useEffect, useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Megaphone, BookOpen, Sparkles, Wrench, Bug } from 'lucide-react'
import { announcementOpenAtom, guideOpenAtom } from '../../store/atoms'
import { RELEASE_NOTES, type ReleaseNote } from './release-notes'

import { dismissForToday } from './announcement-utils'

const TYPE_ICON: Record<ReleaseNote['type'], typeof Sparkles> = {
  major: Sparkles,
  minor: Wrench,
  patch: Bug,
}

const TYPE_LABEL: Record<ReleaseNote['type'], string> = {
  major: 'Major',
  minor: 'Minor',
  patch: 'Patch',
}

const TYPE_COLOR: Record<ReleaseNote['type'], string> = {
  major: 'var(--accent)',
  minor: 'var(--text-success)',
  patch: 'var(--text-secondary)',
}

/** 최근 3건만 표시 */
const VISIBLE_NOTES = RELEASE_NOTES.slice(0, 3)

export function AnnouncementModal() {
  const [isOpen, setIsOpen] = useAtom(announcementOpenAtom)
  const setGuideOpen = useSetAtom(guideOpenAtom)

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [setIsOpen])

  const handleDismissAndClose = useCallback(() => {
    dismissForToday()
    setIsOpen(false)
  }, [setIsOpen])

  const handleOpenGuide = useCallback(() => {
    setIsOpen(false)
    setGuideOpen(true)
  }, [setIsOpen, setGuideOpen])

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, handleClose])

  if (!isOpen) return null

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
        aria-label="공지사항"
        className="fixed left-1/2 top-1/2 z-50 w-[480px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-64px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl animate-scale-in flex flex-col"
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-5 py-3 shrink-0">
          <Megaphone size={16} className="text-[var(--accent)]" />
          <h2 className="flex-1 text-sm font-medium text-[var(--text-primary)]">
            공지사항
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none"
            aria-label="닫기"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 릴리즈노트 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {VISIBLE_NOTES.map((note, idx) => {
            const Icon = TYPE_ICON[note.type]
            return (
              <div
                key={note.version}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] p-4"
              >
                {/* 버전 헤더 */}
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} style={{ color: TYPE_COLOR[note.type] }} />
                  <span
                    className="text-xs font-semibold"
                    style={{ color: TYPE_COLOR[note.type] }}
                  >
                    {note.version}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {TYPE_LABEL[note.type]}
                  </span>
                  <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                    {note.date}
                  </span>
                </div>

                {/* 제목 */}
                <h3 className={`text-sm font-medium text-[var(--text-primary)] mb-2 ${idx === 0 ? '' : 'opacity-80'}`}>
                  {note.title}
                </h3>

                {/* 하이라이트 */}
                <ul className="space-y-1">
                  {note.highlights.map((h) => (
                    <li
                      key={h}
                      className="flex items-start gap-2 text-xs text-[var(--text-secondary)]"
                    >
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        {/* 푸터 */}
        <div className="border-t border-[var(--border-default)] px-5 py-3 shrink-0 space-y-3">
          {/* 사용방법 보기 */}
          <button
            type="button"
            onClick={handleOpenGuide}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
          >
            <BookOpen size={14} />
            사용방법 보기
          </button>

          {/* 닫기 영역 */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleDismissAndClose}
              className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer bg-transparent border-none"
            >
              오늘 더 이상 보지 않기
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer border-none"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
