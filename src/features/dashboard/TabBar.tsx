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
import { ICON_MAP, DEFAULT_ITEM_TITLE } from '../../shared/constants'
import { useClickOutside } from '../../shared/hooks/useClickOutside'
import { useGuardedTabClose } from '../../shared/hooks/useGuardedTabClose'
import { computeTabWindow } from './tabWindow'
import type { Item } from '../../core/db'

const OVERFLOW_BTN_W = 44
/** 아직 렌더되지 않아 실측 폭을 모르는 탭의 추정 폭 */
const ESTIMATED_TAB_W = 160

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
  const setTabContextMenu = useSetAtom(tabContextMenuAtom)
  const { requestClose } = useGuardedTabClose()

  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const tabContainerRef = useRef<HTMLDivElement>(null)
  const tabElsRef = useRef<Map<number, HTMLElement>>(new Map())
  // 창 밖으로 밀려 언마운트된 탭의 폭도 기억해야 다음 계산이 흔들리지 않는다(tabElsRef는 마운트된 것만 가짐)
  const tabWidthsRef = useRef<Map<number, number>>(new Map())
  const [tabWindow, setTabWindow] = useState(() => ({ start: 0, end: openTabs.length || 100 }))
  // 이전 창의 왼쪽 끝 — 탭 클릭만으로 창이 움직이지 않게 하는 기준점(R4). ref라 갱신해도 리렌더를 유발하지 않는다
  const anchorRef = useRef<{ id: number | null; index: number }>({ id: null, index: 0 })

  const items = useLiveQuery(
    () => db.items.where('id').anyOf(openTabs).toArray(),
    [openTabs],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  /** 폭을 실측해 표시 창을 재계산 — 계산 규칙 자체는 computeTabWindow가 갖는다 */
  const recalculate = useCallback(() => {
    const container = tabContainerRef.current
    if (!container) return

    // 지금 렌더된 탭들의 실측 폭을 캐시에 반영하고, 닫힌 탭의 폭은 버린다
    tabElsRef.current.forEach((el, id) => tabWidthsRef.current.set(id, el.offsetWidth))
    const openSet = new Set(openTabs)
    tabWidthsRef.current.forEach((_, id) => { if (!openSet.has(id)) tabWidthsRef.current.delete(id) })

    const next = computeTabWindow({
      tabIds: openTabs,
      activeTab,
      available: container.offsetWidth,
      widthOf: (id) => tabWidthsRef.current.get(id) ?? ESTIMATED_TAB_W,
      overflowBtnW: OVERFLOW_BTN_W,
      anchorTabId: anchorRef.current.id,
      anchorIndex: anchorRef.current.index,
    })
    anchorRef.current = { id: openTabs[next.start] ?? null, index: next.start }

    setTabWindow((prev) => (prev.start !== next.start || prev.end !== next.end ? next : prev))
  }, [openTabs, activeTab])

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
    requestClose('single', itemId)
  }

  const handleMiddleClick = (e: React.MouseEvent, itemId: number) => {
    if (e.button === 1) {
      e.preventDefault()
      requestClose('single', itemId)
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

  const visibleTabs = openTabs.slice(tabWindow.start, tabWindow.end)
  // 창이 뒤로 밀리면 앞쪽에도 숨은 탭이 생긴다 — 원래 순서대로 이어붙여 한 메뉴로 보여준다
  const hiddenTabs = [...openTabs.slice(0, tabWindow.start), ...openTabs.slice(tabWindow.end)]

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
                  overflowOpen
                    ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                    : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)]'
                }`}
                title={`${hiddenTabs.length}개 탭 더 있음`}
              >
                <MoreHorizontal size={14} />
                <span className="text-[var(--font-3xs)]">{hiddenTabs.length}</span>
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
                            // 활성화만 하면 표시 창이 이 탭까지 슬라이드한다 — 순서를 바꾸지 않는다
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
                            requestClose('single', tabId)
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
