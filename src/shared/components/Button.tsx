// src/shared/components/Button.tsx

import React from 'react'
import { cn } from '../utils/cn'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  onClick?: (e: React.MouseEvent) => void
  className?: string
  children: React.ReactNode
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-[var(--bg-accent)] text-white hover:opacity-90',
  secondary:
    'border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] border-none',
  danger:
    'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30',
}

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled,
  onClick,
  className,
  children,
}: ButtonProps) => {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      {children}
    </button>
  )
}
