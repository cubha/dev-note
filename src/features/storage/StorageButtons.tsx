// src/features/storage/StorageButtons.tsx
//
// 사이드바 하단 footer — 내보내기 / 가져오기 버튼
// - 내보내기: exportData() 호출 → FSAA/Blob 폴백 → lastExportAt 갱신
// - 가져오기: importData() 호출 → Append → 앱 상태 전체 리셋
// - 암호화 키 불일치 시 인라인 경고 표시

import { useState } from 'react'
import { useSetAtom } from 'jotai'
import {
  openTabsAtom,
  activeTabAtom,
  selectedFolderAtom,
  expandedFoldersAtom,
  dirtyItemsAtom,
  tabStatesAtom,
} from '../../store/atoms'
import { exportData } from './export'
import { importFromFile, importData } from './import'

type FeedbackState =
  | { type: 'idle' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string }
  | { type: 'warning'; message: string }

export function StorageButtons() {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>({ type: 'idle' })

  const setOpenTabs       = useSetAtom(openTabsAtom)
  const setActiveTab      = useSetAtom(activeTabAtom)
  const setSelectedFolder = useSetAtom(selectedFolderAtom)
  const setExpandedFolders = useSetAtom(expandedFoldersAtom)
  const setDirtyItems     = useSetAtom(dirtyItemsAtom)
  const setTabStates      = useSetAtom(tabStatesAtom)

  const showFeedback = (state: FeedbackState, durationMs = 3000) => {
    setFeedback(state)
    setTimeout(() => setFeedback({ type: 'idle' }), durationMs)
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

  // ── 가져오기 ─────────────────────────────────────────────────
  const handleImport = async () => {
    if (exporting || importing) return
    setImporting(true)
    setFeedback({ type: 'idle' })
    try {
      const rawText = await importFromFile()
      const result = await importData(rawText)

      // 가져오기 성공 → 앱 상태 전체 리셋
      setOpenTabs([])
      setActiveTab(null)
      setSelectedFolder(null)
      setExpandedFolders(new Set<number>())
      setDirtyItems(new Set<number>())
      setTabStates(new Map())

      if (result.cryptoMismatch) {
        showFeedback(
          {
            type: 'warning',
            message: `가져오기 완료 (${result.foldersAdded}폴더 ${result.itemsAdded}항목). 암호화 키가 달라 일부 항목을 열 수 없을 수 있습니다.`,
          },
          6000,
        )
      } else {
        showFeedback({
          type: 'success',
          message: `가져오기 완료 (${result.foldersAdded}폴더 ${result.itemsAdded}항목)`,
        })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof Error && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : '가져오기 실패'
      showFeedback({ type: 'error', message })
    } finally {
      setImporting(false)
    }
  }

  // ── 피드백 색상 ──────────────────────────────────────────────
  const feedbackColor =
    feedback.type === 'success' ? 'text-[#4ec9b0]'
    : feedback.type === 'error' ? 'text-[#f48771]'
    : feedback.type === 'warning' ? 'text-[#cca700]'
    : ''

  const isLoading = exporting || importing

  return (
    <footer className="border-t border-[#2d2d2d] p-2">
      <div className="flex gap-1">
        {/* 내보내기 버튼 */}
        <button
          type="button"
          onClick={handleExport}
          disabled={isLoading}
          className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs text-[#858585] hover:bg-[#2a2d2e] hover:text-[#cccccc] disabled:cursor-not-allowed disabled:opacity-50"
          title="JSON으로 내보내기"
          aria-label="내보내기"
        >
          {exporting ? (
            <SpinnerIcon />
          ) : (
            <UploadIcon />
          )}
          <span>내보내기</span>
        </button>

        {/* 가져오기 버튼 */}
        <button
          type="button"
          onClick={handleImport}
          disabled={isLoading}
          className="flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-xs text-[#858585] hover:bg-[#2a2d2e] hover:text-[#cccccc] disabled:cursor-not-allowed disabled:opacity-50"
          title="JSON에서 가져오기 (기존 데이터에 추가)"
          aria-label="가져오기"
        >
          {importing ? (
            <SpinnerIcon />
          ) : (
            <DownloadIcon />
          )}
          <span>가져오기</span>
        </button>
      </div>

      {/* 인라인 피드백 */}
      {feedback.type !== 'idle' && (
        <p className={`mt-1 px-1 text-[10px] leading-tight ${feedbackColor}`}>
          {feedback.message}
        </p>
      )}
    </footer>
  )
}

// ─── 아이콘 ────────────────────────────────────────────────────

function UploadIcon() {
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

function DownloadIcon() {
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

function SpinnerIcon() {
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
