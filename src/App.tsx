import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { ensureConfig } from './core/db'
import { appConfigAtom } from './store/atoms'

export default function App() {
  const setConfig = useSetAtom(appConfigAtom)

  useEffect(() => {
    ensureConfig().then(setConfig)
  }, [setConfig])

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-[#d4d4d4] font-mono">
      {/* TODO: Sidebar */}
      <aside className="w-60 shrink-0 border-r border-[#2d2d2d] bg-[#252526]">
        <div className="p-3 text-xs text-[#858585] uppercase tracking-widest">DevNote</div>
      </aside>

      {/* TODO: Main area (Tabs + Editor) */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-center h-full text-[#858585] text-sm">
          항목을 선택하거나 새 항목을 만들어 시작하세요.
        </div>
      </main>
    </div>
  )
}
