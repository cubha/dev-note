import { useState, useRef, useCallback, useEffect } from 'react'

/** 마우스 드래그로 높이를 조절하는 훅 */
export const useResizableHeight = (minHeight: number, defaultHeight: number) => {
  const [height, setHeight] = useState(defaultHeight)
  const dragStartY = useRef<number | null>(null)
  const dragStartH = useRef(defaultHeight)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragStartY.current = e.clientY
    dragStartH.current = height

    const onMove = (ev: MouseEvent) => {
      if (dragStartY.current === null) return
      const delta = ev.clientY - dragStartY.current
      setHeight(Math.max(minHeight, dragStartH.current + delta))
    }

    const onUp = () => {
      dragStartY.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height, minHeight])

  useEffect(() => {
    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  return { height, handleDragStart }
}
