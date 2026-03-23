// src/shared/components/ModalHeader.tsx
//
// 공통 모달 헤더 — 아이콘 + 제목 + 닫기 버튼

import { X } from 'lucide-react'
import { cn } from '../utils/cn'

interface ModalHeaderProps {
  title: string
  icon?: React.ReactNode
  onClose: () => void
  /** container 추가 클래스 (패딩 오버라이드 등) */
  className?: string
  /** 제목 텍스트 추가 클래스 (폰트 오버라이드 등) */
  titleClassName?: string
}

export const ModalHeader = ({
  title,
  icon,
  onClose,
  className,
  titleClassName,
}: ModalHeaderProps) => {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-[var(--border-default)] px-5 py-3 shrink-0',
        className,
      )}
    >
      {icon}
      <h2
        className={cn(
          'flex-1 text-sm font-medium text-[var(--text-primary)]',
          titleClassName,
        )}
      >
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none"
        aria-label="닫기"
      >
        <X size={16} />
      </button>
    </div>
  )
}
