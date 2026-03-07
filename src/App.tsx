import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Toaster } from 'sonner'
import { ensureConfig } from './core/db'
import { appConfigAtom, contextMenuAtom, cryptoKeyAtom } from './store/atoms'
import { ContextMenu } from './shared/components/ContextMenu'
import { MasterPasswordModal } from './features/auth/MasterPasswordModal'
import { Sidebar } from './features/sidebar/Sidebar'
import { Dashboard } from './features/dashboard/Dashboard'
import { SettingsModal } from './features/settings/SettingsModal'
import { useGlobalKeyboardShortcuts } from './shared/hooks/useGlobalKeyboardShortcuts'

export default function App() {
  const config = useAtomValue(appConfigAtom)
  const cryptoKey = useAtomValue(cryptoKeyAtom)
  const setConfig = useSetAtom(appConfigAtom)
  const setContextMenu = useSetAtom(contextMenuAtom)

  useGlobalKeyboardShortcuts()

  useEffect(() => {
    ensureConfig().then(setConfig)
  }, [setConfig])

  useEffect(() => {
    if (config === null) return
    document.documentElement.setAttribute('data-theme', config.theme)
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

  if (!config.cryptoEnabled) {
    return (
      <>
        <MasterPasswordModal mode="setup" config={config} />
        <Toaster theme={config.theme} position="bottom-right" toastOptions={{ style: toastStyle }} />
      </>
    )
  }

  if (cryptoKey === null) {
    return (
      <>
        <MasterPasswordModal mode="unlock" config={config} />
        <Toaster theme={config.theme} position="bottom-right" toastOptions={{ style: toastStyle }} />
      </>
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
