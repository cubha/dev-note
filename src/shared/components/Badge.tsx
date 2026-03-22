// src/shared/components/Badge.tsx

import React from 'react'
import { cn } from '../utils/cn'

interface BadgeProps {
  size?: 'xs' | 'sm'
  variant?: 'default' | 'accent' | 'muted'
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

const sizeStyles: Record<NonNullable<BadgeProps['size']>, string> = {
  xs: 'text-[10px]',
  sm: 'text-[11px] px-2',
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: '',
  accent: 'bg-[var(--accent)] text-white',
  muted: 'bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)]',
}

export const Badge = ({
  size = 'xs',
  variant = 'default',
  className,
  style,
  children,
}: BadgeProps) => {
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 font-medium',
        sizeStyles[size],
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
