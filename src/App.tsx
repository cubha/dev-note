import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { ensureConfig } from './core/db'
import { appConfigAtom, contextMenuAtom, cryptoKeyAtom } from './store/atoms'
import { ContextMenu } from './shared/components/ContextMenu'
import { MasterPasswordModal } from './features/auth/MasterPasswordModal'
import { Sidebar } from './features/sidebar/Sidebar'
import { TabBar } from './features/editor/TabBar'
import { EditorPanel } from './features/editor/EditorPanel'
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

  // config.theme 변경 시 <html> data-theme 속성 동기화
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

  // 로딩 중: config가 아직 로드되지 않음
  if (config === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-app)]">
        <p className="text-[var(--text-secondary)]">DevNote 로드 중...</p>
      </div>
    )
  }

  // 첫 설정 필요: 암호화 미활성화
  if (!config.cryptoEnabled) {
    return <MasterPasswordModal mode="setup" config={config} />
  }

  // 잠금 상태: 암호화 활성화되었으나 CryptoKey 없음
  if (cryptoKey === null) {
    return <MasterPasswordModal mode="unlock" config={config} />
  }

  // 정상 진입: aside + main 레이아웃
  return (
    <div className="flex h-screen bg-[var(--bg-app)] text-[var(--text-editor)] font-mono">
      <Sidebar />

      <main className="flex flex-1 flex-col overflow-hidden">
        <TabBar />
        <div className="min-h-0 flex-1">
          <EditorPanel />
        </div>
      </main>
      <ContextMenu />
      <SettingsModal />
    </div>
  )
}
