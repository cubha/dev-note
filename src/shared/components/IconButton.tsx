// src/shared/components/IconButton.tsx

import React from 'react'
import { cn } from '../utils/cn'

interface IconButtonProps {
  icon: React.ReactNode
  size?: 'sm' | 'md'
  tooltip?: string
  disabled?: boolean
  onClick?: (e: React.MouseEvent) => void
  className?: string
}

const sizeStyles: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'h-6 w-6 p-1',
  md: 'h-7 w-7 p-1.5',
}

export const IconButton = ({
  icon,
  size = 'md',
  tooltip,
  disabled,
  onClick,
  className,
}: IconButtonProps) => {
  return (
    <button
      type="button"
      title={tooltip}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        sizeStyles[size],
        className,
      )}
    >
      {icon}
    </button>
  )
}
