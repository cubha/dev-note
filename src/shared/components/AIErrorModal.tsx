// src/shared/components/AIErrorModal.tsx
//
// AI 에러 공통 모달 컴포넌트
// SmartPastePanel(SmartPasteErrorModal) + CardFloatingView(AISummaryErrorModal) 통합

import { useState } from 'react'
import { AlertTriangle, Loader2, Check, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { ItemType } from '../../core/db'
import { reportError } from '../../core/ai'
import { SHARED_API_URL } from '../../store/atoms'
import { isErrorAlreadyReported, markErrorReported } from '../utils/error-report-dedup'
import type { ErrorDetail } from '../constants/ai-errors'
import { AI_ERROR_LABELS } from '../constants/ai-errors'
import { Modal } from './Modal'
import { ModalHeader } from './ModalHeader'
import { Badge } from './Badge'

interface AIErrorModalProps {
  errorDetail: ErrorDetail
  cardType: ItemType
  onClose: () => void
  onReported: () => void
  title?: string
  /** z-index 레벨: false = z-40/z-50 (기본), true = z-[60]/z-[70] (CardFloatingView 위) */
  elevated?: boolean
}

export const AIErrorModal = ({
  errorDetail,
  cardType,
  onClose,
  onReported,
  title = 'AI 오류',
  elevated = false,
}: AIErrorModalProps) => {
  const [sending, setSending] = useState(false)
  const alreadyReported = errorDetail.reported || isErrorAlreadyReported(errorDetail.code)

  const handleReport = async () => {
    if (!SHARED_API_URL || alreadyReported) return
    setSending(true)
    const ok = await reportError(SHARED_API_URL, {
      code: errorDetail.code,
      status: errorDetail.httpStatus,
      message: errorDetail.message,
      cardType,
      timestamp: errorDetail.timestamp,
    })
    setSending(false)
    if (ok) {
      markErrorReported(errorDetail.code)
      onReported()
      toast.success('오류 리포트가 전송되었습니다.', { duration: 3000 })
    } else {
      toast.error('리포트 전송에 실패했습니다.', { duration: 3000 })
    }
  }

  const label = AI_ERROR_LABELS[errorDetail.code] ?? AI_ERROR_LABELS.unknown

  return (
    <Modal
      onClose={onClose}
      width="w-[360px]"
      elevated={elevated}
      enableEsc={false}
      ariaLabel={title}
    >
      <ModalHeader
        title={title}
        icon={<AlertTriangle size={16} className="shrink-0 text-[var(--text-error)]" />}
        onClose={onClose}
        className="px-4"
      />

        {/* 본문 */}
        <div className="px-4 py-4 space-y-3">
          {/* 에러 유형 배지 */}
          <div className="flex items-center gap-2">
            <Badge size="sm" className="bg-[var(--text-error)]/15 text-[var(--text-error)]">
              {label}
            </Badge>
            {errorDetail.httpStatus > 0 && (
              <span className="meta-text">
                HTTP {errorDetail.httpStatus}
              </span>
            )}
          </div>

          {/* 에러 메시지 */}
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {errorDetail.message}
          </p>

          {/* 메타 정보 */}
          <div className="rounded-md bg-[var(--bg-input)] px-3 py-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="meta-text">에러 코드</span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">{errorDetail.code}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="meta-text">시각</span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                {new Date(errorDetail.timestamp).toLocaleString('ko-KR')}
              </span>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center gap-2 border-t border-[var(--border-default)] px-4 py-3">
          <button
            type="button"
            onClick={() => void handleReport()}
            disabled={sending || alreadyReported || !SHARED_API_URL}
            className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none"
          >
            {sending ? (
              <><Loader2 size={12} className="animate-spin" /> 전송 중...</>
            ) : alreadyReported ? (
              <><Check size={12} /> 전송 완료</>
            ) : (
              <><Send size={12} /> 관리자에게 전송</>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer bg-transparent border-none transition-colors"
          >
            닫기
          </button>
        </div>
    </Modal>
  )
}
