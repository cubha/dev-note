// src/features/storage/ImportPassphraseModal.tsx
//
// 암호화 백업 가져오기 — 패스프레이즈 입력 모달
// - 봉투(EncryptedBackup) 감지 시 ImportModeModal 앞에서 표시
// - 제출 시 부모가 복호화 시도 → 실패하면 errorMessage로 모달 유지

import { useEffect, useRef, useState } from 'react'

interface Props {
  onConfirm: (passphrase: string) => void
  onCancel: () => void
  errorMessage?: string
  submitting?: boolean
}

export const ImportPassphraseModal = ({ onConfirm, onCancel, errorMessage, submitting }: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [passphrase, setPassphrase] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onCancel()
  }

  const handleConfirm = () => {
    if (passphrase.length === 0 || submitting) return
    onConfirm(passphrase)
  }

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 size-full border-none bg-transparent p-0 backdrop:bg-black/70"
      onCancel={onCancel}
      onClick={handleBackdropClick}
    >
      <div
        className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--bg-input)] bg-[var(--bg-surface)] p-6 shadow-xl"
        role="presentation"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-semibold text-[var(--text-primary)]">암호화 백업 가져오기</h2>
        <p className="mb-4 text-xs text-[var(--text-secondary)]">
          이 백업은 암호화되어 있습니다. 내보낼 때 사용한 패스프레이즈를 입력하세요.
        </p>

        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm()
          }}
          placeholder="패스프레이즈"
          autoComplete="current-password"
          autoFocus
          className="w-full rounded-md border border-[var(--bg-input)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]"
        />

        {errorMessage && (
          <p className="mt-2 text-xs text-[var(--text-error)]">{errorMessage}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={passphrase.length === 0 || submitting}
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {submitting ? '복호화 중…' : '복호화'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
