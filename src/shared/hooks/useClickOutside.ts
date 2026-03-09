import { useEffect, type RefObject } from 'react'

/** ref 외부 클릭 시 콜백 실행 (capture phase) */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('click', handler, { capture: true })
    return () => document.removeEventListener('click', handler, { capture: true })
  }, [ref, isOpen, onClose])
}
