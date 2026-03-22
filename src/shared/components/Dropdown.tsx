// src/shared/components/Dropdown.tsx

import React, { useEffect, useRef, useState } from 'react'
import { cn } from '../utils/cn'

interface DropdownItem {
  label: string
  value: string
  icon?: React.ReactNode
  danger?: boolean
}

interface DropdownProps {
  items: DropdownItem[]
  value?: string
  onSelect: (value: string) => void
  trigger: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}

export const Dropdown = ({
  items,
  value,
  onSelect,
  trigger,
  align = 'left',
  className,
}: DropdownProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleSelect = (itemValue: string) => {
    onSelect(itemValue)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <div onClick={() => setIsOpen((prev) => !prev)}>{trigger}</div>
      {isOpen && (
        <ul
          className={cn(
            'absolute rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg z-50 min-w-[140px]',
            align === 'right' ? 'right-0' : 'left-0',
            'top-full mt-1',
          )}
        >
          {items.map((item) => (
            <li key={item.value}>
              <button
                type="button"
                onClick={() => handleSelect(item.value)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer bg-transparent border-none',
                  item.danger
                    ? 'text-red-400 hover:text-red-300'
                    : value === item.value
                      ? 'text-[var(--text-primary)] font-medium'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
              >
                {item.icon && <span className="shrink-0">{item.icon}</span>}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
