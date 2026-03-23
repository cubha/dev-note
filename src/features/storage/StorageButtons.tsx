// src/features/storage/StorageButtons.tsx
//
// 사이드바 하단 footer — 내보내기 / 가져오기 버튼
// - 내보내기: exportData() 호출 → FSAA/Blob 폴백 → lastExportAt 갱신
// - 가져오기 흐름:
//   1. 파일 선택 (FSAA / input 폴백)
//   2. 미리보기 파싱 → 현재 DB 통계 조회
//   3. ImportModeModal 표시 (Append / Replace 선택)
//   4. 확인 → importData(rawText, mode) 실행

import { useState } from 'react'
import { useSetAtom } from 'jotai'
import {
  openTabsAtom,
  activeTabAtom,
  selectedFolderAtom,
  expandedFoldersAtom,
  dirtyItemsAtom,
} from '../../store/atoms'
import { db } from '../../core/db'
import { exportData } from './export'
import { importFromFile, importData, parseImportPreview } from './import'
import type { ImportPreview } from './import'
import { ImportModeModal } from './ImportModeModal'
import { Button } from '../../shared/components/Button'

type FeedbackState =
  | { type: 'idle' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }
  | { type: 'warning'; message: string }

interface ModalData {
  rawText: string
  preview: ImportPreview
  currentFolders: number
  currentItems: number
}

export const StorageButtons = () => {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>({ type: 'idle' })
  const [modalData, setModalData] = useState<ModalData | null>(null)

  const setOpenTabs        = useSetAtom(openTabsAtom)
  const setActiveTab       = useSetAtom(activeTabAtom)
  const setSelectedFolder  = useSetAtom(selectedFolderAtom)
  const setExpandedFolders = useSetAtom(expandedFoldersAtom)
  const setDirtyItems      = useSetAtom(dirtyItemsAtom)

  const showFeedback = (state: FeedbackState, durationMs = 3000) => {
    setFeedback(state)
    setTimeout(() => setFeedback({ type: 'idle' }), durationMs)
  }

  // ── 앱 UI 상태 전체 리셋 ─────────────────────────────────────
  const resetUIState = () => {
    setOpenTabs([])
    setActiveTab(null)
    setSelectedFolder(null)
    setExpandedFolders(new Set<number>())
    setDirtyItems(new Set<number>())
  }

  // ── 내보내기 ────────────────────────────────────────────────
  const handleExport = async () => {
    if (exporting || importing) return
    setExporting(true)
    setFeedback({ type: 'idle' })
    try {
      await exportData()
      showFeedback({ type: 'success', message: '내보내기 완료' })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof Error && err.name === 'AbortError') return
      showFeedback({ type: 'error', message: '내보내기 실패' })
    } finally {
      setExporting(false)
    }
  }

  // ── 가져오기 Step 1: 파일 선택 → 미리보기 파싱 → 모달 표시 ──
  const handleImport = async () => {
    if (exporting || importing) return
    setImporting(true)
    setFeedback({ type: 'idle' })
    let modalShown = false
    try {
      const rawText = await importFromFile()
      const preview = await parseImportPreview(rawText)
      const [currentFolders, currentItems] = await Promise.all([
        db.folders.count(),
        db.items.count(),
      ])
      modalShown = true
      setModalData({ rawText, preview, currentFolders, currentItems })
    } catch (err) {
      if (
        (err instanceof DOMException || err instanceof Error) &&
        err.name === 'AbortError'
      ) {
        // 사용자가 파일 선택을 취소한 경우 — 피드백 없이 조용히 종료
      } else {
        const message = err instanceof Error ? err.message : '가져오기 실패'
        showFeedback({ type: 'error', message })
      }
    } finally {
      // 모달이 열리지 않은 경우에만 여기서 importing 해제
      // 모달이 열린 경우 handleModalConfirm / handleModalCancel에서 해제
      if (!modalShown) setImporting(false)
    }
  }

  // ── 가져오기 Step 2: 모달 취소 ─────────────────────────────
  const handleModalCancel = () => {
    setModalData(null)
    setImporting(false)
  }

  // ── 가져오기 Step 3: 모달 확인 → importData 실행 ──────────
  const handleModalConfirm = async (mode: 'append' | 'replace') => {
    if (!modalData) return
    const { rawText } = modalData
    setModalData(null)

    try {
      const result = await importData(rawText, mode)

      // UI 상태 전체 리셋 (탭, 선택, 확장 등)
      resetUIState()

      const modeLabel = result.mode === 'replace' ? '대체' : '추가'
      showFeedback({
        type: 'success',
        message: `가져오기 완료 (${modeLabel}: ${result.foldersAdded}폴더 ${result.itemsAdded}항목)`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '가져오기 실패'
      showFeedback({ type: 'error', message })
    } finally {
      setImporting(false)
    }
  }

  // ── 피드백 색상 ──────────────────────────────────────────────
  const feedbackColor =
    feedback.type === 'success' ? 'text-[var(--text-success)]'
    : feedback.type === 'error' ? 'text-[var(--text-error)]'
    : feedback.type === 'warning' ? 'text-[var(--text-warning)]'
    : ''

  const isLoading = exporting || importing

  return (
    <>
      {/* 가져오기 방식 선택 모달 */}
      {modalData && (
        <ImportModeModal
          importPreview={{
            folders: modalData.preview.folders,
            items: modalData.preview.items,
          }}
          currentStats={{
            folders: modalData.currentFolders,
            items: modalData.currentItems,
          }}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
        />
      )}

      <footer className="border-t border-[var(--border-default)] p-2">
        <div className="flex gap-1">
          {/* 내보내기 버튼 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleExport()}
            disabled={isLoading}
            className="flex-1"
            aria-label="내보내기"
          >
            {exporting ? <SpinnerIcon /> : <UploadIcon />}
            내보내기
          </Button>

          {/* 가져오기 버튼 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleImport()}
            disabled={isLoading}
            className="flex-1"
            aria-label="가져오기"
          >
            {importing ? <SpinnerIcon /> : <DownloadIcon />}
            가져오기
          </Button>
        </div>

        {/* 인라인 피드백 */}
        {feedback.type !== 'idle' && (
          <p className={`mt-1 px-1 text-[10px] leading-tight ${feedbackColor}`}>
            {feedback.message}
          </p>
        )}
      </footer>
    </>
  )
}

// ─── 아이콘 ────────────────────────────────────────────────────

const UploadIcon = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

const DownloadIcon = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

const SpinnerIcon = () => {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 2a10 10 0 1010 10" />
    </svg>
  )
}
