// src/shared/components/Modal.tsx
//
// 공통 모달 컴포넌트 — 백드롭 + fixed+translate 중앙 정렬 컨테이너
// CardFormModal처럼 flex-center 레이아웃이 필요한 경우는 이 컴포넌트를 사용하지 않는다

import { useEffect } from 'react'
import { cn } from '../utils/cn'

interface ModalProps {
  onClose: () => void
  /** Tailwind width 클래스 (기본: 'w-[480px]') */
  width?: string
  /** max-height 클래스 (기본: 없음) */
  maxHeight?: string
  /** z-index 레벨: false=z-40/z-50 (기본), true=z-[60]/z-[70] */
  elevated?: boolean
  /** ESC 키 닫기 (기본: true) */
  enableEsc?: boolean
  ariaLabel?: string
  /** 모달 컨테이너 추가 클래스 */
  className?: string
  children: React.ReactNode
}

export const Modal = ({
  onClose,
  width = 'w-[480px]',
  maxHeight,
  elevated = false,
  enableEsc = true,
  ariaLabel,
  className,
  children,
}: ModalProps) => {
  const backdropZ = elevated ? 'z-[60]' : 'z-40'
  const modalZ = elevated ? 'z-[70]' : 'z-50'

  useEffect(() => {
    if (!enableEsc) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enableEsc, onClose])

  return (
    <>
      {/* 백드롭 */}
      <div
        className={cn('fixed inset-0 bg-black/50', backdropZ)}
        onClick={onClose}
        aria-hidden
      />

      {/* 모달 컨테이너 */}
      <div
        role="dialog"
        aria-modal
        aria-label={ariaLabel}
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
          'rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)]',
          'shadow-2xl animate-scale-in flex flex-col',
          modalZ,
          width,
          'max-w-[calc(100vw-32px)]',
          maxHeight,
          className,
        )}
      >
        {children}
      </div>
    </>
  )
}
