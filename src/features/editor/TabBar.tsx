// src/features/editor/TabBar.tsx

import { useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/db'
import type { Item } from '../../core/db'
import {
  activeTabAtom,
  openTabsAtom,
  tabStatesAtom,
  dirtyItemsAtom,
} from '../../store/atoms'

export function TabBar() {
  const openTabs = useAtomValue(openTabsAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const dirtyItems = useAtomValue(dirtyItemsAtom)

  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setTabStates = useSetAtom(tabStatesAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)

  const tabItems = useLiveQuery<Item[]>(
    () =>
      openTabs.length > 0
        ? db.items.where('id').anyOf(openTabs).toArray()
        : Promise.resolve([] as Item[]),
    [openTabs],
  )

  const orderedItems = useMemo(() => {
    if (!tabItems || tabItems.length === 0) return []
    const map = new Map<number, Item>(tabItems.map((item) => [item.id, item]))
    return openTabs
      .map((id) => map.get(id))
      .filter((item): item is Item => item !== undefined)
  }, [tabItems, openTabs])

  const handleClose = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()

    if (dirtyItems.has(id)) {
      if (
        !window.confirm(
          '저장하지 않은 변경사항이 있습니다. 닫으시겠습니까?',
        )
      ) {
        return
      }
    }

    const newOpenTabs = openTabs.filter((tabId) => tabId !== id)
    setOpenTabs(newOpenTabs)

    setTabStates((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })

    setDirtyItems((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })

    if (activeTab === id) {
      const idx = openTabs.indexOf(id)
      if (newOpenTabs.length === 0) {
        setActiveTab(null)
      } else if (idx > 0) {
        setActiveTab(newOpenTabs[idx - 1])
      } else {
        setActiveTab(newOpenTabs[0])
      }
    }
  }

  if (openTabs.length === 0) return null

  return (
    <div className="flex shrink-0 overflow-x-auto border-b border-[#2d2d2d] bg-[#252526]">
      <div className="flex">
        {orderedItems.map((item) => {
          const isActive = activeTab === item.id
          const isDirty = dirtyItems.has(item.id)

          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveTab(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setActiveTab(item.id)
                }
              }}
              className={`group flex items-center gap-2 border-t px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-t-[#007acc] bg-[#1e1e1e] text-[#d4d4d4]'
                  : 'border-t-transparent bg-[#2d2d2d] text-[#858585] hover:text-[#d4d4d4]'
              }`}
            >
              {isDirty && (
                <span className="shrink-0 text-[#e5c07b]" aria-hidden>
                  ●
                </span>
              )}
              <span className="max-w-[120px] truncate" title={item.title}>
                {item.title}
              </span>
              <button
                type="button"
                onClick={(e) => handleClose(e, item.id)}
                aria-label="탭 닫기"
                className="opacity-0 shrink-0 rounded p-0.5 hover:bg-[#3c3c3c] hover:opacity-100 focus:opacity-100"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
