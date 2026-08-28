// src/features/storage/ImportModeModal.tsx
//
// 가져오기 방식 선택 모달
// - Append: 기존 데이터 유지 + 가져온 항목 추가
// - Replace: 기존 데이터 전체 삭제 → 새 데이터로 대체 (되돌릴 수 없음 경고)

import { useEffect, useRef, useState } from 'react'

export interface ImportPreviewData {
  folders: number
  items: number
  encrypted?: boolean
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

export const ImportModeModal = ({ importPreview, currentStats, onConfirm, onCancel }: Props) => {
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
      className="fixed inset-0 size-full border-none bg-transparent p-0 backdrop:bg-[var(--bg-overlay)]"
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
                <span className="ml-1 text-[var(--font-3xs)] font-normal text-[var(--text-secondary)]">Append</span>
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
                <span className="ml-1 text-[var(--font-3xs)] font-normal text-[var(--text-secondary)]">Replace</span>
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                기존 데이터를 모두 삭제하고 가져온 데이터로 대체합니다.
              </div>
            </div>
          </label>
        </div>

        {/* 안내 슬롯 2개 — **항상 렌더하고 높이를 고정**한다(--import-note-h).
            조건부로 나타났다 사라지게 두면 라디오를 바꾸는 것만으로 모달 높이가 변한다(고정 레이아웃 규약 위반).
            내용만 교체하므로 빈 여백도 생기지 않는다. 넘치면 슬롯 안에서 스크롤. */}

        {/* 파일 암호화 여부 안내 */}
        <div
          className={`mt-3 h-[var(--import-note-h)] overflow-y-auto rounded-md border px-3 py-2.5 ${
            importPreview.encrypted
              ? 'border-yellow-500/40 bg-yellow-500/10'
              : 'border-[var(--border-default)] bg-[var(--bg-input)]'
          }`}
        >
          <p
            className={`text-xs leading-relaxed ${
              importPreview.encrypted ? 'text-[var(--text-warning)]' : 'text-[var(--text-secondary)]'
            }`}
          >
            {importPreview.encrypted
              ? '🔒 암호화된 콘텐츠가 포함된 백업입니다. 가져온 후 보안 탭에서 패스프레이즈를 입력하면 볼 수 있습니다.'
              : '🔓 암호화되지 않은 백업입니다. 콘텐츠가 그대로 저장됩니다.'}
          </p>
        </div>

        {/* 선택한 모드가 기존 데이터에 미치는 영향 */}
        <div
          className={`mt-3 h-[var(--import-note-h)] overflow-y-auto rounded-md border px-3 py-2.5 ${
            mode === 'replace' && hasExistingData
              ? 'border-[var(--text-warning)] bg-[var(--bg-error-hover)]'
              : 'border-[var(--border-default)] bg-[var(--bg-input)]'
          }`}
        >
          <p
            className={`text-xs leading-relaxed ${
              mode === 'replace' && hasExistingData
                ? 'text-[var(--text-warning)]'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            {mode === 'replace' && hasExistingData ? (
              <>
                ⚠ 현재 데이터{' '}
                <span className="font-medium">
                  {currentStats.folders}개 폴더, {currentStats.items}개 항목
                </span>
                이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </>
            ) : hasExistingData ? (
              <>
                현재 데이터{' '}
                <span className="font-medium">
                  {currentStats.folders}개 폴더, {currentStats.items}개 항목
                </span>
                은 그대로 유지되고 가져온 항목이 추가됩니다.
              </>
            ) : (
              '기존 데이터가 없어 두 방식의 결과가 같습니다.'
            )}
          </p>
        </div>

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
            className={mode === 'replace' ? 'btn-danger-lg' : 'btn-primary-lg'}
          >
            가져오기
          </button>
        </div>
      </div>
    </dialog>
  )
}
