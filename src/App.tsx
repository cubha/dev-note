import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { Toaster, toast } from 'sonner'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { db, ensureConfig } from './core/db'
import type { AppConfig } from './core/db'
import { appConfigAtom, contextMenuAtom, announcementOpenAtom, sidebarCollapsedAtom } from './store/atoms'
import { ContextMenu } from './shared/components/ContextMenu'
import { Sidebar } from './features/sidebar/Sidebar'
import { Dashboard } from './features/dashboard/Dashboard'
import { SettingsModal } from './features/settings/SettingsModal'
import { AnnouncementModal } from './features/onboarding/AnnouncementModal'
import { GuideModal } from './features/onboarding/GuideModal'
import { shouldShowAnnouncement } from './features/onboarding/announcement-utils'
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
  const setAnnouncementOpen = useSetAtom(announcementOpenAtom)
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom)
  const backupCheckedRef = useRef(false)
  const announcementCheckedRef = useRef(false)

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
    // 세션당 1회 공지사항 표시 체크
    if (!announcementCheckedRef.current) {
      announcementCheckedRef.current = true
      if (shouldShowAnnouncement()) {
        setAnnouncementOpen(true)
      }
    }
  }, [config, setAnnouncementOpen])

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
    <HotkeysProvider>
    <div className="flex h-screen bg-[var(--bg-app)] text-[var(--text-primary)]">
      {sidebarCollapsed ? (
        /* 접힌 상태: 왼쪽 가장자리 얇은 핸들 — hover 시 확장 */
        <div
          className="group/sidebar-handle shrink-0 flex flex-col items-center w-3 hover:w-10 bg-[var(--bg-sidebar)] border-r border-[var(--border-default)] cursor-pointer transition-all duration-200"
          onClick={() => setSidebarCollapsed(false)}
          title="사이드바 펼치기"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') setSidebarCollapsed(false) }}
        >
          <div className="mt-3 opacity-0 group-hover/sidebar-handle:opacity-100 transition-opacity">
            <svg viewBox="0 0 24 24" className="size-3.5 text-[var(--text-tertiary)]" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </div>
      ) : (
        <Sidebar />
      )}
      <Dashboard />
      <ContextMenu />
      <SettingsModal />
      <AnnouncementModal />
      <GuideModal />
      <Toaster
        theme={config.theme}
        position="bottom-right"
        toastOptions={{ style: toastStyle }}
      />
    </div>
    </HotkeysProvider>
  )
}

const toastStyle: React.CSSProperties = {
  background: 'var(--bg-surface-raised)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
}
