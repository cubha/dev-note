// src/shared/components/Modal.tsx
//
// 공통 모달 컴포넌트 — 백드롭 + fixed+translate 중앙 정렬 컨테이너
// CardFormModal처럼 flex-center 레이아웃이 필요한 경우는 이 컴포넌트를 사용하지 않는다

import { useEffect } from 'react'
import { cn } from '../utils/cn'

interface ModalProps {
  onClose: () => void
  /** Tailwind width 클래스 (기본: 'w-[var(--modal-w-lg)]') */
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
  width = 'w-[var(--modal-w-lg)]',
  maxHeight,
  elevated = false,
  enableEsc = true,
  ariaLabel,
  className,
  children,
}: ModalProps) => {
  const backdropZ = elevated ? 'z-[60]' : 'z-40'
  const modalZ = elevated ? 'z-[70]' : 'z-50'

  // ⚠ window/bubble이 아니라 **document의 capture 단계**여야 한다.
  // @tanstack/react-hotkeys(escape.clear)가 document에서 Escape를 처리하며 전파를 끊어서,
  // window 버블 리스너에는 이벤트가 도달하지 않는다(실측: doc-capture·doc-bubble만 발화,
  // win-bubble 미발화). 그래서 이 컴포넌트를 쓰는 모든 모달의 Escape 닫기가 동작하지 않았다.
  // capture로 먼저 받고 stopPropagation으로 끊어야 모달 뒤에서 escape.clear(선택 해제·검색 초기화)가
  // 같이 발화하는 것도 막힌다.
  useEffect(() => {
    if (!enableEsc) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [enableEsc, onClose])

  return (
    <>
      {/* 백드롭 */}
      <div
        className={cn('fixed inset-0 bg-[var(--bg-overlay)]', backdropZ)}
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
