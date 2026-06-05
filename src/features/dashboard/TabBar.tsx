// src/features/dashboard/TabBar.tsx
//
// 탭 목록 컴포넌트 — 탭 전환, 닫기, 오버플로우 메뉴, 드래그 순서 변경

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileText, X, MoreHorizontal } from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { db } from '../../core/db'
import {
  openTabsAtom, activeTabAtom, dirtyItemsAtom, tabContextMenuAtom,
} from '../../store/atoms'
import { closeTab } from '../../store/tabHelpers'
import { ICON_MAP, DEFAULT_ITEM_TITLE } from '../../shared/constants'
import { useClickOutside } from '../../shared/hooks/useClickOutside'
import type { Item } from '../../core/db'

const OVERFLOW_BTN_W = 44

interface SortableTabProps {
  tabId: number
  tabElsRef: React.MutableRefObject<Map<number, HTMLElement>>
  items: Item[] | undefined
  activeTab: number | null
  dirtyItems: Set<number>
  setActiveTab: (id: number | null) => void
  handleCloseTab: (e: React.MouseEvent, itemId: number) => void
  handleMiddleClick: (e: React.MouseEvent, itemId: number) => void
  handleTabContextMenu: (e: React.MouseEvent, tabId: number) => void
}

const SortableTab = ({
  tabId, tabElsRef, items, activeTab, dirtyItems,
  setActiveTab, handleCloseTab, handleMiddleClick, handleTabContextMenu,
}: SortableTabProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(tabId),
  })

  const refCallback = useCallback((el: HTMLDivElement | null) => {
    setNodeRef(el)
    if (el) tabElsRef.current.set(tabId, el)
    else tabElsRef.current.delete(tabId)
  }, [setNodeRef, tabElsRef, tabId])

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const item = items?.find((i) => i.id === tabId)
  const isActive = activeTab === tabId
  const isDirty = dirtyItems.has(tabId)
  const Icon = item ? ICON_MAP[item.type] : FileText

  return (
    <div
      ref={refCallback}
      style={style}
      {...attributes}
      {...listeners}
      className={`group/tab relative flex shrink-0 items-stretch transition-colors ${
        isActive
          ? 'bg-[var(--bg-app)]'
          : 'bg-transparent hover:bg-[var(--bg-surface-hover)]'
      }`}
    >
      {isActive && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" />
      )}
      <button
        type="button"
        onClick={() => setActiveTab(tabId)}
        onMouseDown={(e) => handleMiddleClick(e, tabId)}
        onContextMenu={(e) => handleTabContextMenu(e, tabId)}
        className={`flex items-center gap-1.5 pl-3 pr-1 text-xs font-medium cursor-pointer border-none bg-transparent ${
          isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] group-hover/tab:text-[var(--text-secondary)]'
        }`}
      >
        <Icon size={13} className="shrink-0" />
        <span className="max-w-[100px] truncate">
          {item === undefined ? '...' : (item.title || DEFAULT_ITEM_TITLE)}
        </span>
        {isDirty && (
          <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-warning)]" />
        )}
      </button>
      <button
        type="button"
        onClick={(e) => handleCloseTab(e, tabId)}
        className={`shrink-0 self-center rounded p-0.5 mr-1 transition-colors border-none bg-transparent ${
          isActive
            ? 'text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
            : 'text-transparent group-hover/tab:text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
        }`}
      >
        <X size={12} />
      </button>
    </div>
  )
}

export const TabBar = () => {
  const [openTabs, setOpenTabs] = useAtom(openTabsAtom)
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const dirtyItems = useAtomValue(dirtyItemsAtom)
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = openTabs.indexOf(parseInt(active.id as string))
    const newIdx = openTabs.indexOf(parseInt(over.id as string))
    if (oldIdx !== -1 && newIdx !== -1) {
      setOpenTabs(arrayMove(openTabs, oldIdx, newIdx))
    }
  }

  const visibleTabs = openTabs.slice(0, visibleCount)
  const hiddenTabs = openTabs.slice(visibleCount)

  return (
    <div className="flex items-stretch flex-1 min-w-0" ref={tabContainerRef}>
      {openTabs.length > 0 && (
        <>
          <div className="flex items-stretch overflow-hidden min-w-0 flex-1">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleTabDragEnd}
            >
              <SortableContext
                items={visibleTabs.map((id) => String(id))}
                strategy={horizontalListSortingStrategy}
              >
                {visibleTabs.map((tabId) => (
                  <SortableTab
                    key={tabId}
                    tabId={tabId}
                    tabElsRef={tabElsRef}
                    items={items}
                    activeTab={activeTab}
                    dirtyItems={dirtyItems}
                    setActiveTab={setActiveTab}
                    handleCloseTab={handleCloseTab}
                    handleMiddleClick={handleMiddleClick}
                    handleTabContextMenu={handleTabContextMenu}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {hiddenTabs.length > 0 && (
            <div className="relative flex items-center ml-0.5 shrink-0" ref={overflowRef}>
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
                      <div
                        key={tabId}
                        className={`flex w-full items-center transition-colors ${
                          isActive
                            ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setOpenTabs(prev => [tabId, ...prev.filter(id => id !== tabId)])
                            setActiveTab(tabId)
                            setOverflowOpen(false)
                          }}
                          onContextMenu={(e) => { setOverflowOpen(false); handleTabContextMenu(e, tabId) }}
                          className="flex flex-1 items-center gap-2 px-3 py-1.5 cursor-pointer bg-transparent border-none text-inherit min-w-0"
                        >
                          <Icon size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                          <span className="flex-1 text-xs text-left truncate">
                            {item === undefined ? '...' : (item.title || DEFAULT_ITEM_TITLE)}
                          </span>
                          {isDirty && (
                            <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-warning)]" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            closeTab(tabId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
                            setOverflowOpen(false)
                          }}
                          className="shrink-0 rounded p-0.5 mr-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors border-none bg-transparent"
                        >
                          <X size={11} />
                        </button>
                      </div>
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
