import { toast } from 'sonner'

/**
 * 텍스트를 클립보드에 복사하고 토스트로 피드백을 표시한다.
 */
export async function copyToClipboard(text: string, label?: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(label ? `${label} 복사됨` : '클립보드에 복사됨', {
      duration: 2000,
    })
  } catch {
    toast.error('복사에 실패했습니다', { duration: 3000 })
  }
}
