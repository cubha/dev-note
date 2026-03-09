import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Toaster, toast } from 'sonner'
import { db, ensureConfig } from './core/db'
import type { AppConfig } from './core/db'
import { appConfigAtom, contextMenuAtom } from './store/atoms'
import { ContextMenu } from './shared/components/ContextMenu'
import { Sidebar } from './features/sidebar/Sidebar'
import { Dashboard } from './features/dashboard/Dashboard'
import { SettingsModal } from './features/settings/SettingsModal'
import { useGlobalKeyboardShortcuts } from './shared/hooks/useGlobalKeyboardShortcuts'

/** 브라우저에 데이터 삭제 방지 요청 */
async function requestPersistentStorage(): Promise<void> {
  if (navigator.storage?.persist) {
    await navigator.storage.persist()
  }
}

/** 백업 알림 체크 (세션당 1회) */
async function checkBackupReminder(config: AppConfig): Promise<void> {
  const itemCount = await db.items.count()
  const daysSinceExport = config.lastExportAt
    ? Math.floor((Date.now() - config.lastExportAt) / (1000 * 60 * 60 * 24))
    : null

  if (daysSinceExport === null && itemCount >= 10) {
    toast.info('아직 백업을 하지 않았습니다. 설정 → 내보내기를 권장합니다.', { duration: 6000 })
  } else if (daysSinceExport !== null && daysSinceExport >= 7 && itemCount >= 5) {
    toast.info(`마지막 내보내기 후 ${daysSinceExport}일 경과. 백업을 권장합니다.`, { duration: 6000 })
  }
}

export default function App() {
  const config = useAtomValue(appConfigAtom)
  const setConfig = useSetAtom(appConfigAtom)
  const setContextMenu = useSetAtom(contextMenuAtom)
  const backupCheckedRef = useRef(false)

  useGlobalKeyboardShortcuts()

  useEffect(() => {
    ensureConfig().then(setConfig)
    void requestPersistentStorage()
  }, [setConfig])

  useEffect(() => {
    if (config === null) return
    document.documentElement.setAttribute('data-theme', config.theme)
    // 세션당 1회 백업 알림 체크
    if (!backupCheckedRef.current) {
      backupCheckedRef.current = true
      void checkBackupReminder(config)
    }
  }, [config])

  useEffect(() => {
    const close = () =>
      setContextMenu((prev) => ({ ...prev, isOpen: false }))
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [setContextMenu])

  if (config === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-app)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[var(--accent)] animate-pulse" />
          <p className="text-sm text-[var(--text-tertiary)]">DevNote 로드 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
      <Sidebar />
      <Dashboard />
      <ContextMenu />
      <SettingsModal />
      <Toaster
        theme={config.theme}
        position="bottom-right"
        toastOptions={{ style: toastStyle }}
      />
    </div>
  )
}

const toastStyle: React.CSSProperties = {
  background: 'var(--bg-surface-raised)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
}
