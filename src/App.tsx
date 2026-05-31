import { useEffect, useRef, useState } from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { Toaster, toast } from 'sonner'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { db, ensureConfig } from './core/db'
import type { AppConfig } from './core/db'
import {
  appConfigAtom,
  contextMenuAtom,
  announcementOpenAtom,
  sidebarCollapsedAtom,
  sidebarMobileOpenAtom,
  activeTabAtom,
  selectedFolderAtom,
  selectedProviderAtom,
  userApiKeyAtom,
} from './store/atoms'
import { ContextMenu } from './shared/components/ContextMenu'
import { Sidebar } from './features/sidebar/Sidebar'
import { Dashboard } from './features/dashboard/Dashboard'
import { SettingsModal } from './features/settings/SettingsModal'
import { AnnouncementModal } from './features/onboarding/AnnouncementModal'
import { GuideModal } from './features/onboarding/GuideModal'
import { CommandPalette } from './shared/components/CommandPalette'
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

const MOBILE_BREAKPOINT = 768

export default function App() {
  const config = useAtomValue(appConfigAtom)
  const setConfig = useSetAtom(appConfigAtom)
  const setSelectedProvider = useSetAtom(selectedProviderAtom)
  const setUserApiKey = useSetAtom(userApiKeyAtom)
  const setContextMenu = useSetAtom(contextMenuAtom)
  const setAnnouncementOpen = useSetAtom(announcementOpenAtom)
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useAtom(sidebarMobileOpenAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const backupCheckedRef = useRef(false)
  const announcementCheckedRef = useRef(false)

  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
  )

  useGlobalKeyboardShortcuts()

  useEffect(() => {
    ensureConfig().then((cfg) => {
      setConfig(cfg)
      setSelectedProvider(cfg.selectedProvider)
      setUserApiKey(cfg.userApiKey)
    })
    void requestPersistentStorage()
    const savedSidebarWidth = localStorage.getItem('sidebar-width')
    if (savedSidebarWidth) {
      document.documentElement.style.setProperty('--sidebar-width', savedSidebarWidth)
    }
  }, [setConfig, setSelectedProvider, setUserApiKey])

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      if (!e.matches) setSidebarMobileOpen(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [setSidebarMobileOpen])

  useEffect(() => {
    if (isMobile) setSidebarMobileOpen(false)
  // 항목 열기/폴더 선택 시 모바일 사이드바 자동 닫기
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedFolder])

  useEffect(() => {
    if (config === null) return
    document.documentElement.setAttribute('data-theme', config.theme)
    if (!backupCheckedRef.current) {
      backupCheckedRef.current = true
      void checkBackupReminder(config)
    }
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
      {isMobile ? (
        /* 모바일: 오버레이 드로어 */
        <>
          {sidebarMobileOpen && (
            <div
              className="fixed inset-0 z-40 bg-[var(--bg-overlay)]"
              onClick={() => setSidebarMobileOpen(false)}
              aria-hidden
            />
          )}
          <div
            className="fixed left-0 top-0 h-full z-50 transition-transform duration-300 ease-in-out"
            style={{ transform: sidebarMobileOpen ? 'translateX(0)' : 'translateX(-100%)' }}
          >
            <Sidebar />
          </div>
        </>
      ) : sidebarCollapsed ? (
        /* 데스크탑 접힌 상태: 왼쪽 가장자리 얇은 핸들 */
        <div
          className="group/sidebar-handle shrink-0 flex flex-col items-center w-3 hover:w-10 bg-[var(--bg-sidebar)] border-r border-[var(--border-default)] cursor-pointer transition-all duration-200"
          onClick={() => setSidebarCollapsed(false)}
          title="사이드바 펼치기"
          role="button"
          aria-pressed={sidebarCollapsed}
          aria-label="사이드바 펼치기"
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
        /* 데스크탑 펼친 상태 */
        <Sidebar />
      )}
      <Dashboard />
      <ContextMenu />
      <SettingsModal />
      <CommandPalette />
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
