// src/features/dashboard/TabBar.tsx
//
// NotePad 스타일 탭 바 — 열린 카드 목록을 탭으로 표시

import { useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { Terminal, Database, Globe, FileText, Puzzle, X } from 'lucide-react'
import { db } from '../../core/db'
import type { ItemType } from '../../core/db'
import {
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
} from '../../store/atoms'
import { closeTab } from '../../store/tabHelpers'

const TAB_ICON: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  custom: Puzzle,
}

export function TabBar() {
  const openTabs = useAtomValue(openTabsAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const dirtyItems = useAtomValue(dirtyItemsAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)

  const items = useLiveQuery(
    () => db.items.where('id').anyOf(openTabs).toArray(),
    [openTabs],
  )

  const handleClose = (e: React.MouseEvent, itemId: number) => {
    e.stopPropagation()
    closeTab(itemId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
  }

  const handleMiddleClick = (e: React.MouseEvent, itemId: number) => {
    if (e.button === 1) {
      e.preventDefault()
      closeTab(itemId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
    }
  }

  if (openTabs.length === 0) return null

  return (
    <div className="flex items-end gap-0 border-b border-[var(--border-default)] bg-[var(--bg-surface)] overflow-x-auto scrollbar-none">
      {openTabs.map((tabId) => {
        const item = items?.find((i) => i.id === tabId)
        const isActive = activeTab === tabId
        const isDirty = dirtyItems.has(tabId)
        const Icon = item ? TAB_ICON[item.type] : FileText

        return (
          <button
            key={tabId}
            type="button"
            onClick={() => setActiveTab(tabId)}
            onMouseDown={(e) => handleMiddleClick(e, tabId)}
            className={`group/tab relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer border-none ${
              isActive
                ? 'bg-[var(--bg-app)] text-[var(--text-primary)]'
                : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {/* Active indicator */}
            {isActive && (
              <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--accent)]" />
            )}

            <Icon size={13} className="shrink-0" />
            <span className="max-w-[120px] truncate">
              {item?.title || '로딩...'}
            </span>

            {/* Dirty dot */}
            {isDirty && (
              <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-warning)]" />
            )}

            {/* Close button */}
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => handleClose(e, tabId)}
              className={`shrink-0 rounded p-0.5 transition-colors ${
                isActive
                  ? 'text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                  : 'text-transparent group-hover/tab:text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <X size={12} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
