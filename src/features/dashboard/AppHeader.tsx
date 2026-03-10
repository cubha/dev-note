// src/features/dashboard/AppHeader.tsx
//
// 통합 앱 헤더 — 로고(메인 이동) + 탭 목록(최대 5개 + 오버플로우) + 검색/필터(우측)

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  FileText,
  X, MoreHorizontal, Search, Filter, Tag, Bell,
} from 'lucide-react'
import { db } from '../../core/db'
import type { ItemType } from '../../core/db'
import { TYPE_META } from '../../core/types'
import {
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
  searchQueryAtom,
  typeFilterAtom,
  tagFilterAtom,
  tabContextMenuAtom,
  announcementOpenAtom,
} from '../../store/atoms'
import { closeTab } from '../../store/tabHelpers'
import { ICON_MAP } from '../../shared/constants'
import { useClickOutside } from '../../shared/hooks/useClickOutside'

const OVERFLOW_BTN_W = 44 // "... N" 버튼 예약 너비
const FILTER_TYPES: (ItemType | null)[] = [null, 'server', 'db', 'api', 'markdown', 'document']

export function AppHeader() {
  const openTabs = useAtomValue(openTabsAtom)
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const dirtyItems = useAtomValue(dirtyItemsAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const setTabContextMenu = useSetAtom(tabContextMenuAtom)
  const setAnnouncementOpen = useSetAtom(announcementOpenAtom)

  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom)
  const [typeFilter, setTypeFilter] = useAtom(typeFilterAtom)
  const [tagFilter, setTagFilter] = useAtom(tagFilterAtom)

  const [overflowOpen, setOverflowOpen] = useState(false)
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const tagRef = useRef<HTMLDivElement>(null)
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

  // 탭 컨테이너 크기 변화 감지
  useEffect(() => {
    const container = tabContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(recalculate)
    ro.observe(container)
    return () => ro.disconnect()
  }, [recalculate])

  // 탭 목록·아이템 변경 시 즉시 재계산 (페인트 전)
  useLayoutEffect(() => {
    recalculate()
  }, [recalculate, items])

  const allTags = useLiveQuery(async () => {
    const tagSet = new Set<string>()
    await db.items.each(item => { for (const t of item.tags) tagSet.add(t) })
    return [...tagSet].sort()
  }, [])

  // 외부 클릭 닫기
  const closeOverflow = useCallback(() => setOverflowOpen(false), [])
  const closeTagDropdown = useCallback(() => setTagDropdownOpen(false), [])
  useClickOutside(overflowRef, overflowOpen, closeOverflow)
  useClickOutside(tagRef, tagDropdownOpen, closeTagDropdown)

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
    <div className="flex items-stretch border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-2 shrink-0 min-h-[44px]">

      {/* ── 좌측: 탭 목록 ───────────────── */}
      <div className="flex items-stretch flex-1 min-w-0" ref={tabContainerRef}>

        {/* 탭 목록 */}
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
                  {/* 활성 탭 하단 강조선 */}
                  {isActive && (
                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" />
                  )}

                  <Icon size={13} className="shrink-0" />
                  <span className="max-w-[100px] truncate">
                    {item === undefined ? '...' : (item.title || '제목없음')}
                  </span>

                  {/* 미저장 dot */}
                  {isDirty && (
                    <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-warning)]" />
                  )}

                  {/* 닫기 버튼 */}
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

            {/* 오버플로우 `...` 버튼 */}
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
                            {item === undefined ? '...' : (item.title || '제목없음')}
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

      {/* ── 우측: 검색 + 타입 필터 + 태그 필터 ─── */}
      <div className="flex items-center gap-2 pl-3 shrink-0">

        {/* 검색 입력 */}
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-2.5 text-[var(--text-tertiary)] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색... (Ctrl+K)"
            className="w-44 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] pl-8 pr-7 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setTypeFilter(null); setTagFilter(null) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* 구분선 */}
        <div className="w-px h-5 bg-[var(--border-default)] shrink-0" />

        {/* 타입 필터 */}
        <div className="flex items-center gap-0.5">
          <Filter size={12} className="text-[var(--text-tertiary)] mr-0.5 shrink-0" />
          {FILTER_TYPES.map((ft) => {
            const isActive = typeFilter === ft
            const label = ft ? TYPE_META[ft].label : '전체'
            const colorKey = ft ? TYPE_META[ft].colorKey : null
            return (
              <button
                key={ft ?? 'all'}
                type="button"
                onClick={() => setTypeFilter(ft)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
                  isActive
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
                style={
                  isActive && colorKey
                    ? { background: `var(--badge-${colorKey}-bg)`, color: `var(--badge-${colorKey}-text)` }
                    : isActive
                      ? { background: 'var(--bg-surface-hover)' }
                      : undefined
                }
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* 태그 필터 */}
        {allTags && allTags.length > 0 && (
          <div className="relative" ref={tagRef}>
            <button
              type="button"
              onClick={() => setTagDropdownOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
                tagFilter
                  ? 'bg-[var(--badge-markdown-bg)] text-[var(--badge-markdown-text)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Tag size={11} />
              {tagFilter ? `#${tagFilter}` : '태그'}
            </button>
            {tagDropdownOpen && (
              <div className="absolute right-0 top-9 z-50 w-40 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg animate-scale-in">
                <button
                  type="button"
                  onClick={() => { setTagFilter(null); setTagDropdownOpen(false) }}
                  className={`flex w-full items-center px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none ${
                    tagFilter === null ? 'text-[var(--text-active)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  전체
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => { setTagFilter(tag); setTagDropdownOpen(false) }}
                    className={`flex w-full items-center px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none ${
                      tagFilter === tag ? 'text-[var(--text-active)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 구분선 */}
        <div className="w-px h-5 bg-[var(--border-default)] shrink-0" />

        {/* 공지사항 버튼 */}
        <button
          type="button"
          onClick={() => setAnnouncementOpen(true)}
          className="flex items-center justify-center rounded p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer bg-transparent border-none"
          title="공지사항"
        >
          <Bell size={15} />
        </button>
      </div>
    </div>
  )
}
