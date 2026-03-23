import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface UsePasswordRevealReturn {
  revealed: boolean
  toggle: () => void
  inputType: 'text' | 'password'
  Icon: LucideIcon
  ariaLabel: string
}

export const usePasswordReveal = (): UsePasswordRevealReturn => {
  const [revealed, setRevealed] = useState(false)
  return {
    revealed,
    toggle: () => setRevealed(prev => !prev),
    inputType: revealed ? 'text' : 'password',
    Icon: revealed ? EyeOff : Eye,
    ariaLabel: revealed ? '비밀번호 숨기기' : '비밀번호 보기',
  }
}
