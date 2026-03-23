// src/features/onboarding/GuideModal.tsx
//
// 사용 가이드 슬라이드 모달 (커스텀 스테퍼)

import { useState, useEffect, useCallback } from 'react'
import { useAtom } from 'jotai'
import {
  LayoutGrid, FolderTree, Search,
  Code2, Download, ChevronLeft, ChevronRight, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { guideOpenAtom } from '../../store/atoms'
import { GUIDE_STEPS, type GuideStep } from './guide-steps'
import { Button } from '../../shared/components/Button'
import { Modal } from '../../shared/components/Modal'
import { ModalHeader } from '../../shared/components/ModalHeader'

const ICON_MAP: Record<GuideStep['icon'], LucideIcon> = {
  cards: LayoutGrid,
  folders: FolderTree,
  search: Search,
  editor: Code2,
  export: Download,
  ai: Sparkles,
}

const ICON_COLOR: Record<GuideStep['icon'], string> = {
  cards: 'var(--accent)',
  folders: 'var(--text-success)',
  search: 'var(--badge-api-text)',
  editor: 'var(--badge-note-text)',
  export: 'var(--badge-document-text)',
  ai: 'var(--badge-db-text)',
}

export const GuideModal = () => {
  const [isOpen, setIsOpen] = useAtom(guideOpenAtom)
  const [step, setStep] = useState(0)

  const total = GUIDE_STEPS.length

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setStep(0)
  }, [setIsOpen])

  const handlePrev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1))
  }, [])

  const handleNext = useCallback(() => {
    if (step === total - 1) {
      handleClose()
    } else {
      setStep((s) => s + 1)
    }
  }, [step, total, handleClose])

  // 키보드: ESC, 좌/우 화살표
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
      else if (e.key === 'ArrowLeft') handlePrev()
      else if (e.key === 'ArrowRight') handleNext()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, handleClose, handlePrev, handleNext])

  // 열릴 때 step 리셋
  useEffect(() => {
    if (isOpen) setStep(0)
  }, [isOpen])

  if (!isOpen) return null

  const current = GUIDE_STEPS[step]
  const Icon = ICON_MAP[current.icon]
  const iconColor = ICON_COLOR[current.icon]
  const isLast = step === total - 1

  return (
    <Modal
      onClose={handleClose}
      width="w-[520px]"
      enableEsc={false}
      ariaLabel="사용 가이드"
    >
      <ModalHeader title="사용 가이드" onClose={handleClose} />

        {/* 슬라이드 콘텐츠 — 각 영역 고정 높이로 슬라이드 간 위치 일관성 유지 */}
        <div className="px-5 py-6 flex flex-col items-center text-center h-[280px]">
          {/* 아이콘 — 고정 영역 */}
          <div
            className="flex items-center justify-center size-14 rounded-2xl shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${iconColor} 15%, transparent)` }}
          >
            <Icon size={26} style={{ color: iconColor }} />
          </div>

          {/* 제목 — 고정 영역 */}
          <h3 className="text-base font-semibold text-[var(--text-primary)] mt-4 shrink-0">
            {current.title}
          </h3>

          {/* 설명 — 고정 높이 영역, 텍스트 길이 무관하게 동일 공간 */}
          <div className="h-[52px] flex items-start justify-center mt-2 shrink-0">
            <p className="text-sm text-[var(--text-secondary)] max-w-[380px] leading-relaxed">
              {current.description}
            </p>
          </div>

          {/* 팁 — 하단 고정 */}
          <div className="flex flex-col gap-1.5 w-full max-w-[360px] mt-auto text-left">
            {current.tips.map((tip) => (
              <div
                key={tip}
                className="flex items-start gap-2 rounded-md bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-secondary)]"
              >
                <span className="text-[10px] text-[var(--text-tertiary)] shrink-0 mt-px">TIP</span>
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 푸터: 도트 + 네비게이션 */}
        <div className="border-t border-[var(--border-default)] px-5 py-3 shrink-0">
          {/* 도트 인디케이터 */}
          <div className="flex items-center justify-center gap-1.5 mb-3">
            {GUIDE_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setStep(idx)}
                className={`rounded-full transition-all cursor-pointer border-none ${
                  idx === step
                    ? 'size-2 bg-[var(--accent)]'
                    : 'size-1.5 bg-[var(--text-placeholder)] hover:bg-[var(--text-tertiary)]'
                }`}
                aria-label={`${idx + 1}번 슬라이드`}
              />
            ))}
            <span className="ml-2 text-[10px] text-[var(--text-tertiary)]">
              {step + 1}/{total}
            </span>
          </div>

          {/* 버튼 */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={step === 0}>
              <ChevronLeft size={14} />
              이전
            </Button>

            <div className="flex items-center gap-2">
              {!isLast && (
                <Button variant="ghost" size="sm" onClick={handleClose}>건너뛰기</Button>
              )}
              <Button variant="primary" size="sm" onClick={handleNext}>
                {isLast ? '완료' : '다음'}
                {!isLast && <ChevronRight size={14} />}
              </Button>
            </div>
          </div>
        </div>
    </Modal>
  )
}
