// src/shared/components/Button.tsx

import React from 'react'
import { cn } from '../utils/cn'

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit' | 'reset'
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-[var(--accent)] text-[var(--text-on-solid)] hover:opacity-90',
  secondary:
    'border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] border-none',
  // danger = 옅은 틴트. 파괴적이지만 **주 액션이 아닌** 선택지용(예: "저장 안 함" 옆에 "저장"이 있을 때).
  danger:
    'bg-red-500/10 text-[var(--text-error)] hover:bg-red-500/20 border border-red-500/30',
  // destructive = 솔리드 채움. 파괴가 **그 대화상자의 주 액션**일 때(삭제 확인 등).
  // .btn-danger / .btn-danger-lg 유틸 클래스와 같은 토큰을 쓴다 — 그쪽은 비-Button 요소용.
  destructive:
    'bg-[var(--bg-error-solid)] text-[var(--text-on-solid)] hover:opacity-90 border-none',
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) => {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
