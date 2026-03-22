// src/features/dashboard/TabBar.tsx
//
// 탭 목록 컴포넌트 — 탭 전환, 닫기, 오버플로우 메뉴

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, X, MoreHorizontal } from 'lucide-react'
import { db } from '../../core/db'
import {
  openTabsAtom, activeTabAtom, dirtyItemsAtom, tabContextMenuAtom,
} from '../../store/atoms'
import { closeTab } from '../../store/tabHelpers'
import { ICON_MAP, DEFAULT_ITEM_TITLE } from '../../shared/constants'
import { useClickOutside } from '../../shared/hooks/useClickOutside'

const OVERFLOW_BTN_W = 44

export const TabBar = () => {
  const openTabs = useAtomValue(openTabsAtom)
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const dirtyItems = useAtomValue(dirtyItemsAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const setTabContextMenu = useSetAtom(tabContextMenuAtom)

  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const tabContainerRef = useRef<HTMLDivElement>(null)
  const tabElsRef = useRef<Map<number, HTMLElement>>(new Map())
  const [visibleCount, setVisibleCount] = useState(() => openTabs.length || 100)

  const items = useLiveQuery(
    () => db.items.where('id').anyOf(openTabs).toArray(),
    [openTabs],
  )

  const recalculate = useCallback(() => {
    const container = tabContainerRef.current
    if (!container) return

    const available = container.offsetWidth
    let used = 0
    let count = 0

    for (let i = 0; i < openTabs.length; i++) {
      const el = tabElsRef.current.get(openTabs[i])
      const tabW = el ? el.offsetWidth : 160
      const isLast = i === openTabs.length - 1

      if (isLast) {
        if (used + tabW <= available) count++
      } else {
        if (used + tabW + OVERFLOW_BTN_W <= available) {
          used += tabW
          count++
        } else {
          break
        }
      }
    }

    const next = Math.max(1, count)
    setVisibleCount((prev) => (prev !== next ? next : prev))
  }, [openTabs])

  useEffect(() => {
    const container = tabContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(recalculate)
    ro.observe(container)
    return () => ro.disconnect()
  }, [recalculate])

  useLayoutEffect(() => {
    recalculate()
  }, [recalculate, items])

  const closeOverflow = useCallback(() => setOverflowOpen(false), [])
  useClickOutside(overflowRef, overflowOpen, closeOverflow)

  const handleCloseTab = (e: React.MouseEvent, itemId: number) => {
    e.stopPropagation()
    closeTab(itemId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
  }

  const handleMiddleClick = (e: React.MouseEvent, itemId: number) => {
    if (e.button === 1) {
      e.preventDefault()
      closeTab(itemId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
    }
  }

  const handleTabContextMenu = (e: React.MouseEvent, tabId: number) => {
    e.preventDefault()
    e.stopPropagation()
    setTabContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, tabId })
  }

  const visibleTabs = openTabs.slice(0, visibleCount)
  const hiddenTabs = openTabs.slice(visibleCount)

  return (
    <div className="flex items-stretch flex-1 min-w-0" ref={tabContainerRef}>
      {openTabs.length > 0 && (
        <>
          {visibleTabs.map((tabId) => {
            const item = items?.find((i) => i.id === tabId)
            const isActive = activeTab === tabId
            const isDirty = dirtyItems.has(tabId)
            const Icon = item ? ICON_MAP[item.type] : FileText

            return (
              <button
                key={tabId}
                ref={(el) => {
                  if (el) tabElsRef.current.set(tabId, el)
                  else tabElsRef.current.delete(tabId)
                }}
                type="button"
                onClick={() => setActiveTab(tabId)}
                onMouseDown={(e) => handleMiddleClick(e, tabId)}
                onContextMenu={(e) => handleTabContextMenu(e, tabId)}
                className={`group/tab relative flex shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-colors cursor-pointer border-none ${
                  isActive
                    ? 'bg-[var(--bg-app)] text-[var(--text-primary)]'
                    : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {isActive && (
                  <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" />
                )}
                <Icon size={13} className="shrink-0" />
                <span className="max-w-[100px] truncate">
                  {item === undefined ? '...' : (item.title || DEFAULT_ITEM_TITLE)}
                </span>
                {isDirty && (
                  <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-warning)]" />
                )}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => handleCloseTab(e, tabId)}
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

          {hiddenTabs.length > 0 && (
            <div className="relative flex items-center ml-0.5" ref={overflowRef}>
              <button
                type="button"
                onClick={() => setOverflowOpen((prev) => !prev)}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
                  overflowOpen || hiddenTabs.some((id) => id === activeTab)
                    ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)]'
                }`}
                title={`${hiddenTabs.length}개 탭 더 있음`}
              >
                <MoreHorizontal size={14} />
                <span className="text-[10px]">{hiddenTabs.length}</span>
              </button>

              {overflowOpen && (
                <div className="absolute left-0 top-11 z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg animate-scale-in">
                  {hiddenTabs.map((tabId) => {
                    const item = items?.find((i) => i.id === tabId)
                    const isActive = activeTab === tabId
                    const isDirty = dirtyItems.has(tabId)
                    const Icon = item ? ICON_MAP[item.type] : FileText

                    return (
                      <button
                        key={tabId}
                        type="button"
                        onClick={() => {
                          setOpenTabs(prev => [tabId, ...prev.filter(id => id !== tabId)])
                          setActiveTab(tabId)
                          setOverflowOpen(false)
                        }}
                        onContextMenu={(e) => { setOverflowOpen(false); handleTabContextMenu(e, tabId) }}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 cursor-pointer bg-transparent border-none transition-colors ${
                          isActive
                            ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        <Icon size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                        <span className="flex-1 text-xs text-left truncate">
                          {item === undefined ? '...' : (item.title || DEFAULT_ITEM_TITLE)}
                        </span>
                        {isDirty && (
                          <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-warning)]" />
                        )}
                        <span
                          role="button"
                          tabIndex={-1}
                          onClick={(e) => {
                            e.stopPropagation()
                            closeTab(tabId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
                            setOverflowOpen(false)
                          }}
                          className="shrink-0 rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          <X size={11} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
