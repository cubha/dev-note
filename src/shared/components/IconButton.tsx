// src/shared/components/IconButton.tsx

import React from 'react'
import { cn } from '../utils/cn'

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  icon: React.ReactNode
  size?: 'sm' | 'md'
  tooltip?: string
}

const sizeStyles: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'h-6 w-6 p-1',
  md: 'h-7 w-7 p-1.5',
}

export const IconButton = ({
  icon,
  size = 'md',
  tooltip,
  className,
  ...rest
}: IconButtonProps) => {
  return (
    <button
      type="button"
      title={tooltip}
      className={cn(
        'flex items-center justify-center rounded text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        sizeStyles[size],
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  )
}
