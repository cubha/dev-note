// src/features/storage/ImportModeModal.tsx
//
// 가져오기 방식 선택 모달
// - Append: 기존 데이터 유지 + 가져온 항목 추가
// - Replace: 기존 데이터 전체 삭제 → 새 데이터로 대체 (되돌릴 수 없음 경고)

import { useEffect, useRef, useState } from 'react'

export interface ImportPreviewData {
  folders: number
  items: number
}

export interface CurrentStatsData {
  folders: number
  items: number
}

interface Props {
  importPreview: ImportPreviewData
  currentStats: CurrentStatsData
  onConfirm: (mode: 'append' | 'replace') => void
  onCancel: () => void
}

export function ImportModeModal({ importPreview, currentStats, onConfirm, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'append' | 'replace'>('append')

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const hasExistingData = currentStats.folders > 0 || currentStats.items > 0

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onCancel()
    }
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
        <h2 className="mb-1 text-base font-semibold text-[var(--text-primary)]">가져오기 방식 선택</h2>
        <p className="mb-4 text-xs text-[var(--text-secondary)]">
          가져올 파일:{' '}
          <span className="text-[var(--text-primary)]">
            {importPreview.folders}개 폴더, {importPreview.items}개 항목
          </span>
        </p>

        <div className="space-y-2">
          {/* Append 옵션 */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
              mode === 'append'
                ? 'border-[var(--border-accent)] bg-[var(--bg-item-selected)]'
                : 'border-[var(--bg-input)] hover:border-[var(--text-placeholder)]'
            }`}
          >
            <input
              type="radio"
              name="import-mode"
              value="append"
              checked={mode === 'append'}
              onChange={() => setMode('append')}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                추가{' '}
                <span className="ml-1 text-[10px] font-normal text-[var(--text-secondary)]">Append</span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                기존 데이터를 유지하고 가져온 항목을 추가합니다. 중복이 발생할 수 있습니다.
              </div>
            </div>
          </label>

          {/* Replace 옵션 */}
          <label
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
              mode === 'replace'
                ? 'border-[var(--text-error)] bg-[var(--bg-error-hover)]'
                : 'border-[var(--bg-input)] hover:border-[var(--text-placeholder)]'
            }`}
          >
            <input
              type="radio"
              name="import-mode"
              value="replace"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
              className="mt-0.5 accent-[var(--text-error)]"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                대체{' '}
                <span className="ml-1 text-[10px] font-normal text-[var(--text-secondary)]">Replace</span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                기존 데이터를 모두 삭제하고 가져온 데이터로 대체합니다.
              </div>
            </div>
          </label>
        </div>

        {/* Replace 경고 */}
        {mode === 'replace' && hasExistingData && (
          <div className="mt-3 rounded-md border border-[var(--text-warning)] bg-[var(--bg-error-hover)] px-3 py-2.5">
            <p className="text-xs leading-relaxed text-[var(--text-warning)]">
              ⚠ 현재 데이터{' '}
              <span className="font-medium">
                {currentStats.folders}개 폴더, {currentStats.items}개 항목
              </span>
              이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
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
            onClick={() => onConfirm(mode)}
            className={`rounded px-4 py-2 text-sm font-medium text-white transition-colors ${
              mode === 'replace'
                ? 'bg-[#b83c2d] hover:bg-[#9e3326]'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
            }`}
          >
            가져오기
          </button>
        </div>
      </div>
    </dialog>
  )
}
