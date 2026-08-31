import { useEffect, useRef, useState } from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { Toaster, toast } from 'sonner'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { db, ensureConfig } from './core/db'
import type { AppConfig } from './core/db'
import { isDraft } from './core/cardState'
import {
  appConfigAtom,
  contextMenuAtom,
  announcementOpenAtom,
  sidebarCollapsedAtom,
  sidebarMobileOpenAtom,
  openTabsAtom,
  activeTabAtom,
  selectedFolderAtom,
  selectedProviderAtom,
} from './store/atoms'
import { loadSessionSnapshot } from './store/sessionPersist'
import { filterRestorableTabs, orphanDraftIds, mergeDraftTabs } from './core/draft'
import { listDraftItemIds, deleteDrafts } from './core/draftStore'
import { ContextMenu } from './shared/components/ContextMenu'
import { Sidebar } from './features/sidebar/Sidebar'
import { Dashboard } from './features/dashboard/Dashboard'
import { SettingsModal } from './features/settings/SettingsModal'
import { AdminMetrics } from './features/admin/AdminMetrics'
import { AnnouncementModal } from './features/onboarding/AnnouncementModal'
import { GuideModal } from './features/onboarding/GuideModal'
import { CommandPalette } from './shared/components/CommandPalette'
import { GlobalFileDropZone } from './features/storage/GlobalFileDropZone'
import { CloseConfirmDialog } from './shared/components/CloseConfirmDialog'
import { ConfirmHost } from './shared/components/ConfirmHost'
import { DraftDirtySync } from './features/dashboard/DraftDirtySync'
import { SessionPersist } from './features/dashboard/SessionPersist'
import { shouldShowAnnouncement } from './features/onboarding/announcement-utils'
import { useGlobalKeyboardShortcuts } from './shared/hooks/useGlobalKeyboardShortcuts'

/**
 * 부팅 시 열린 탭 세션 복원 — localStorage 스냅샷을 라이브 아이템 기준으로 필터링하고,
 * 드래프트가 있는 탭은 복원 목록에 없어도 강제로 열며, 어떤 아이템도 안 가리키는
 * 고아 드래프트는 GC한다.
 */
async function restoreSession(
  setOpenTabs: (v: number[]) => void,
  setActiveTab: (v: number | null) => void,
): Promise<void> {
  const snapshot = loadSessionSnapshot()

  const [liveIds, draftIds] = await Promise.all([
    db.items.toCollection().primaryKeys(),
    listDraftItemIds(),
  ])
  const liveIdSet = new Set(liveIds as number[])

  const orphanIds = orphanDraftIds(draftIds, liveIdSet)
  if (orphanIds.length > 0) void deleteDrafts(orphanIds)

  const restorable = snapshot ? filterRestorableTabs(snapshot.openTabs, liveIdSet) : []
  const liveDraftIds = draftIds.filter((id) => liveIdSet.has(id))
  const merged = mergeDraftTabs(restorable, liveDraftIds)

  if (merged.length === 0) return // 복원할 것도 강제로 열 것도 없으면 빈 상태 그대로(초기값과 동일)

  setOpenTabs(merged)

  // ⚠ activeTab === null 은 "값이 없음"이 아니라 **"사용자가 메인 화면에 있었다"는 명시적 상태**다.
  // 이걸 stale id(삭제된 카드를 가리키던 경우)와 똑같이 취급해 마지막 탭으로 폴백하면,
  // 메인 화면에서 새로고침만 했는데 열어본 적 없는 카드가 열린다.
  // snapshot 자체가 없을 때(최초 부팅·기록 손상)는 어디에 있었는지 알 수 없으므로 종전대로 마지막 탭을 연다.
  if (!snapshot) {
    setActiveTab(merged[merged.length - 1])
    return
  }
  if (snapshot.activeTab === null) return // 메인 화면 유지 (activeTabAtom 초기값이 null)
  setActiveTab(merged.includes(snapshot.activeTab)
    ? snapshot.activeTab
    : merged[merged.length - 1])
}

/** 브라우저에 데이터 삭제 방지 요청 */
async function requestPersistentStorage(): Promise<void> {
  if (navigator.storage?.persist) {
    await navigator.storage.persist()
  }
}

/** 백업 알림 체크 (세션당 1회) */
async function checkBackupReminder(config: AppConfig): Promise<void> {
  // draft(미저장 새 카드)는 유령 개수로 알림을 앞당길 수 있어 카운트에서 제외
  const itemCount = await db.items.filter((i) => !isDraft(i)).count()
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
  const setContextMenu = useSetAtom(contextMenuAtom)
  const setAnnouncementOpen = useSetAtom(announcementOpenAtom)
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom)
  const [sidebarMobileOpen, setSidebarMobileOpen] = useAtom(sidebarMobileOpenAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const sessionRestoredRef = useRef(false)
  const backupCheckedRef = useRef(false)
  const announcementCheckedRef = useRef(false)

  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
  )

  useGlobalKeyboardShortcuts()

  useEffect(() => {
    // BYOK 키는 복원하지 않는다 — 세션 메모리 전용이라 애초에 저장된 값이 없다.
    // 부팅 시 항상 공유 키 모드로 시작하고, 사용자가 이번 세션에 입력해야 BYOK가 켜진다.
    ensureConfig().then((cfg) => {
      setConfig(cfg)
      setSelectedProvider(cfg.selectedProvider)
    })
    void requestPersistentStorage()
    const savedSidebarWidth = localStorage.getItem('sidebar-width')
    if (savedSidebarWidth) {
      document.documentElement.style.setProperty('--sidebar-width', savedSidebarWidth)
    }
  }, [setConfig, setSelectedProvider])

  // 세션 복원 — StrictMode 이중 마운트 방지용 ref 가드(setOpenTabs/setActiveTab은 안정적이라
  // 의존성 배열만으로는 재실행을 막지 못한다)
  useEffect(() => {
    if (sessionRestoredRef.current) return
    sessionRestoredRef.current = true
    void restoreSession(setOpenTabs, setActiveTab)
  }, [setOpenTabs, setActiveTab])

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
      <CloseConfirmDialog />
      <ConfirmHost />
      <DraftDirtySync />
      <SessionPersist />
      <AnnouncementModal />
      <GuideModal />
      <AdminMetrics />
      <GlobalFileDropZone />
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
