// src/features/sidebar/SidebarResizeHandle.tsx

import { useCallback, useRef } from 'react'

const MIN_WIDTH = 180
const MAX_WIDTH = 480
const STORAGE_KEY = 'sidebar-width'

export const SidebarResizeHandle = () => {
  const dragging = useRef(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX))
      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`)
    }

    const onMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim()
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed)) {
        localStorage.setItem(STORAGE_KEY, `${parsed}px`)
      }
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  return (
    <div
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize group/resize z-20 select-none"
      onMouseDown={onMouseDown}
      role="separator"
      aria-label="사이드바 너비 조절"
      aria-orientation="vertical"
    >
      <div className="absolute right-0 top-0 h-full w-px opacity-0 group-hover/resize:opacity-100 transition-opacity duration-150 bg-[var(--accent)]" />
    </div>
  )
}
