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
import {
  importFromFile,
  importData,
  parseImportPreview,
  detectBackupType,
  decryptBackup,
} from './import'
import type { ImportPreview } from './import'
import { ImportModeModal } from './ImportModeModal'
import { ImportPassphraseModal } from './ImportPassphraseModal'
import { ExportOptionsModal } from './ExportOptionsModal'
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
  const [showExportOptions, setShowExportOptions] = useState(false)
  // 암호화 백업 가져오기: 패스프레이즈 입력 대기 상태
  const [pendingEncrypted, setPendingEncrypted] = useState<{ rawText: string } | null>(null)
  const [passphraseError, setPassphraseError] = useState('')
  const [decrypting, setDecrypting] = useState(false)

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

  // ── 내보내기 Step 1: 옵션 모달 열기 ─────────────────────────
  const handleExport = () => {
    if (exporting || importing) return
    setFeedback({ type: 'idle' })
    setShowExportOptions(true)
  }

  // ── 내보내기 Step 2: 옵션 확인 → exportData 실행 ────────────
  const handleExportConfirm = async (passphrase?: string) => {
    setShowExportOptions(false)
    setExporting(true)
    try {
      await exportData(passphrase)
      showFeedback({
        type: 'success',
        message: passphrase ? '암호화 내보내기 완료' : '내보내기 완료',
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof Error && err.name === 'AbortError') return
      showFeedback({ type: 'error', message: '내보내기 실패' })
    } finally {
      setExporting(false)
    }
  }

  // ── 평문 백업 → 미리보기 파싱 후 방식 선택 모달 표시 ────────
  const proceedToModeModal = async (plainText: string): Promise<void> => {
    const preview = await parseImportPreview(plainText)
    const [currentFolders, currentItems] = await Promise.all([
      db.folders.count(),
      db.items.count(),
    ])
    setModalData({ rawText: plainText, preview, currentFolders, currentItems })
  }

  // ── 가져오기 Step 1: 파일 선택 → 봉투 감지 → 분기 ──────────
  const handleImport = async () => {
    if (exporting || importing) return
    setImporting(true)
    setFeedback({ type: 'idle' })
    let modalShown = false
    try {
      const rawText = await importFromFile()
      const type = detectBackupType(rawText)

      if (type === 'invalid') {
        throw new Error('파일 형식이 dev-note 백업 형식과 다릅니다')
      }
      if (type === 'encrypted') {
        // 패스프레이즈 입력 모달로 분기 — 복호화 후 카운트 표시
        modalShown = true
        setPassphraseError('')
        setPendingEncrypted({ rawText })
        return
      }
      // plain
      await proceedToModeModal(rawText)
      modalShown = true
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
      if (!modalShown) setImporting(false)
    }
  }

  // ── 암호화 백업: 패스프레이즈 제출 → 복호화 → 방식 선택 ────
  const handlePassphraseConfirm = async (passphrase: string) => {
    if (!pendingEncrypted) return
    setDecrypting(true)
    setPassphraseError('')
    try {
      const plainText = await decryptBackup(pendingEncrypted.rawText, passphrase)
      // proceedToModeModal이 (복호화 성공 후) 실패해도 모달이 살아있어 에러가 표시되도록
      // 성공적으로 다음 단계로 넘어간 뒤에만 패스프레이즈 모달을 닫는다
      await proceedToModeModal(plainText)
      setPendingEncrypted(null)
    } catch (err) {
      // 패스프레이즈 불일치 등 — 모달 유지하고 에러 표시
      setPassphraseError(err instanceof Error ? err.message : '복호화 실패')
    } finally {
      setDecrypting(false)
    }
  }

  const handlePassphraseCancel = () => {
    setPendingEncrypted(null)
    setPassphraseError('')
    setImporting(false)
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
      {/* 내보내기 옵션 모달 */}
      {showExportOptions && (
        <ExportOptionsModal
          onConfirm={(passphrase) => void handleExportConfirm(passphrase)}
          onCancel={() => setShowExportOptions(false)}
        />
      )}

      {/* 암호화 백업 패스프레이즈 입력 모달 */}
      {pendingEncrypted && (
        <ImportPassphraseModal
          onConfirm={(passphrase) => void handlePassphraseConfirm(passphrase)}
          onCancel={handlePassphraseCancel}
          errorMessage={passphraseError}
          submitting={decrypting}
        />
      )}

      {/* 가져오기 방식 선택 모달 */}
      {modalData && (
        <ImportModeModal
          importPreview={{
            folders: modalData.preview.folders,
            items: modalData.preview.items,
            encrypted: modalData.preview.encrypted,
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
            onClick={handleExport}
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
