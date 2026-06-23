// src/features/storage/ExportOptionsModal.tsx
//
// 내보내기 옵션 선택 모달
// - 일반 백업(plain): 평문 JSON
// - 암호화 백업(encrypted): 패스프레이즈로 봉투 암호화 (분실 시 복구 불가 경고)

import { useEffect, useRef, useState } from 'react'

interface Props {
  onConfirm: (passphrase?: string) => void
  onCancel: () => void
}

export const ExportOptionsModal = ({ onConfirm, onCancel }: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'plain' | 'encrypted'>('plain')
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onCancel()
  }

  const handleConfirm = () => {
    if (mode === 'plain') {
      onConfirm(undefined)
      return
    }
    if (passphrase.length === 0) {
      setError('패스프레이즈를 입력하세요')
      return
    }
    if (passphrase !== confirm) {
      setError('패스프레이즈가 일치하지 않습니다')
      return
    }
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
        <h2 className="mb-1 text-base font-semibold text-[var(--text-primary)]">내보내기 방식 선택</h2>
        <p className="mb-4 text-xs text-[var(--text-secondary)]">
          백업 파일을 평문 또는 암호화 상태로 내보낼 수 있습니다.
        </p>

        <div className="space-y-2">
          {/* 일반 백업 */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
              mode === 'plain'
                ? 'border-[var(--border-accent)] bg-[var(--bg-item-selected)]'
                : 'border-[var(--bg-input)] hover:border-[var(--text-placeholder)]'
            }`}
          >
            <input
              type="radio"
              name="export-mode"
              value="plain"
              checked={mode === 'plain'}
              onChange={() => {
                setMode('plain')
                setError('')
              }}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                일반 백업{' '}
                <span className="ml-1 text-[10px] font-normal text-[var(--text-secondary)]">Plain</span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                평문 JSON으로 내보냅니다. 어떤 기기에서도 바로 가져올 수 있습니다.
              </div>
            </div>
          </label>

          {/* 암호화 백업 */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
              mode === 'encrypted'
                ? 'border-[var(--border-accent)] bg-[var(--bg-item-selected)]'
                : 'border-[var(--bg-input)] hover:border-[var(--text-placeholder)]'
            }`}
          >
            <input
              type="radio"
              name="export-mode"
              value="encrypted"
              checked={mode === 'encrypted'}
              onChange={() => {
                setMode('encrypted')
                setError('')
              }}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                암호화 백업{' '}
                <span className="ml-1 text-[10px] font-normal text-[var(--text-secondary)]">Encrypted</span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                패스프레이즈로 파일 전체를 암호화합니다. 가져올 때 같은 패스프레이즈가 필요합니다.
              </div>
            </div>
          </label>
        </div>

        {/* 패스프레이즈 입력 */}
        {mode === 'encrypted' && (
          <div className="mt-3 space-y-2">
            <input
              type="password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value)
                setError('')
              }}
              placeholder="패스프레이즈"
              autoComplete="new-password"
              className="w-full rounded-md border border-[var(--bg-input)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                setError('')
              }}
              placeholder="패스프레이즈 확인"
              autoComplete="new-password"
              className="w-full rounded-md border border-[var(--bg-input)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]"
            />
            <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2">
              <p className="text-xs leading-relaxed text-yellow-500">
                ⚠ 패스프레이즈를 분실하면 이 백업은 복구할 수 없습니다.
              </p>
            </div>
            {error && <p className="text-xs text-[var(--text-error)]">{error}</p>}
          </div>
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
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            내보내기
          </button>
        </div>
      </div>
    </dialog>
  )
}
