// src/shared/components/TextArea.tsx

import React, { useEffect, useRef } from 'react'
import { cn } from '../utils/cn'

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean
}

export const TextArea = ({ autoResize, className, onChange, ...props }: TextAreaProps) => {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoResize && ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = `${ref.current.scrollHeight}px`
    }
  }, [autoResize, props.value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (autoResize && ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = `${ref.current.scrollHeight}px`
    }
    onChange?.(e)
  }

  return (
    <textarea
      ref={ref}
      onChange={handleChange}
      {...props}
      className={cn(
        'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors',
        autoResize && 'resize-none',
        className,
      )}
    />
  )
}
