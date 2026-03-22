// src/shared/components/Input.tsx

import React from 'react'
import { cn } from '../utils/cn'

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md'
}

const sizeStyles: Record<NonNullable<InputProps['size']>, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
}

export const Input = ({ size = 'md', className, ...props }: InputProps) => {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors',
        sizeStyles[size],
        className,
      )}
    />
  )
}
