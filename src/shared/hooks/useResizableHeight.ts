import { useState, useRef, useCallback, useEffect } from 'react'

/** 마우스 드래그로 높이를 조절하는 훅 */
export const useResizableHeight = (minHeight: number, defaultHeight: number) => {
  const [height, setHeight] = useState(defaultHeight)
  const dragStartY = useRef<number | null>(null)
  const dragStartH = useRef(defaultHeight)
  const onMoveRef = useRef<((e: MouseEvent) => void) | null>(null)
  const onUpRef = useRef<(() => void) | null>(null)

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
      onMoveRef.current = null
      onUpRef.current = null
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    onMoveRef.current = onMove
    onUpRef.current = onUp
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [height, minHeight])

  useEffect(() => {
    return () => {
      if (onMoveRef.current) document.removeEventListener('mousemove', onMoveRef.current)
      if (onUpRef.current) document.removeEventListener('mouseup', onUpRef.current)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [])

  return { height, handleDragStart }
}
