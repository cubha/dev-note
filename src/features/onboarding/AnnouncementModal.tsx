// src/features/onboarding/AnnouncementModal.tsx
//
// 공지사항 + 릴리즈노트 모달
// - 앱 초기화 시 자동 표시 (24시간 dismiss)
// - "사용방법 보기" → GuideModal 연동

import { useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { Megaphone, BookOpen, Sparkles, Wrench, Bug } from 'lucide-react'
import { announcementOpenAtom, guideOpenAtom } from '../../store/atoms'
import { RELEASE_NOTES, type ReleaseNote } from './release-notes'

import { dismissForToday } from './announcement-utils'
import { Button } from '../../shared/components/Button'
import { Modal } from '../../shared/components/Modal'
import { ModalHeader } from '../../shared/components/ModalHeader'

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

export const AnnouncementModal = () => {
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

  if (!isOpen) return null

  return (
    <Modal
      onClose={handleClose}
      width="w-[480px]"
      maxHeight="max-h-[calc(100vh-64px)]"
      ariaLabel="공지사항"
    >
      <ModalHeader
        title="공지사항"
        icon={<Megaphone size={16} className="text-[var(--accent)]" />}
        onClose={handleClose}
      />

        {/* 릴리즈노트 목록 */}
        <div className="h-[600px] overflow-y-auto px-5 py-4 space-y-3">
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
          <Button variant="secondary" onClick={handleOpenGuide} className="w-full">
            <BookOpen size={14} />
            사용방법 보기
          </Button>

          {/* 닫기 영역 */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handleDismissAndClose}>
              오늘 더 이상 보지 않기
            </Button>
            <Button variant="primary" size="sm" onClick={handleClose}>닫기</Button>
          </div>
        </div>
    </Modal>
  )
}
