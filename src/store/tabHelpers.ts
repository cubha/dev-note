// src/store/tabHelpers.ts
//
// 탭 열기/닫기/삭제 헬퍼 — Jotai atom setter를 받아 상태를 갱신
// 일괄 닫기: closeOtherTabs, closeTabsToRight, closeTabsToLeft, closeSavedTabs, closeAllTabs

import type { SetStateAction } from 'jotai'

type Setter<T> = (update: SetStateAction<T>) => void

/**
 * 항목 삭제 시 탭/dirty 상태 일괄 정리
 * — 모든 삭제 경로(ContextMenu, CardGrid, Delete키)에서 공용 사용
 */
export function removeItemsFromState(
  ids: number[],
  setOpenTabs: Setter<number[]>,
  setActiveTab: Setter<number | null>,
  setDirtyItems: Setter<Set<number>>,
) {
  setOpenTabs((prev) => prev.filter((id) => !ids.includes(id)))
  setActiveTab((prev) =>
    prev !== null && ids.includes(prev) ? null : prev,
  )
  setDirtyItems((prev) => {
    const next = new Set(prev)
    ids.forEach((id) => next.delete(id))
    return next
  })
}

/**
 * 탭 열기: 이미 열려있으면 활성화만, 없으면 추가 후 활성화
 */
export function openTab(
  itemId: number,
  setOpenTabs: Setter<number[]>,
  setActiveTab: Setter<number | null>,
) {
  setOpenTabs((prev) => {
    if (prev.includes(itemId)) return prev
    return [...prev, itemId]
  })
  setActiveTab(itemId)
}

/**
 * 탭 닫기: 목록에서 제거 + 활성 탭이면 인접 탭으로 전환
 */
export function closeTab(
  itemId: number,
  openTabs: number[],
  activeTab: number | null,
  setOpenTabs: Setter<number[]>,
  setActiveTab: Setter<number | null>,
  setDirtyItems: Setter<Set<number>>,
) {
  const idx = openTabs.indexOf(itemId)
  if (idx === -1) return

  const next = openTabs.filter((id) => id !== itemId)
  setOpenTabs(next)

  // dirty 상태 제거
  setDirtyItems((prev) => {
    const s = new Set(prev)
    s.delete(itemId)
    return s
  })

  // 활성 탭 전환
  if (activeTab === itemId) {
    if (next.length === 0) {
      setActiveTab(null)
    } else if (idx < next.length) {
      setActiveTab(next[idx])
    } else {
      setActiveTab(next[next.length - 1])
    }
  }
}

/**
 * 지정 탭 제외 나머지 탭 모두 닫기
 */
export function closeOtherTabs(
  keepId: number,
  openTabs: number[],
  setOpenTabs: Setter<number[]>,
  setActiveTab: Setter<number | null>,
  setDirtyItems: Setter<Set<number>>,
) {
  const toClose = openTabs.filter((id) => id !== keepId)
  setOpenTabs([keepId])
  setActiveTab(keepId)
  setDirtyItems((prev) => {
    const s = new Set(prev)
    toClose.forEach((id) => s.delete(id))
    return s
  })
}

/**
 * 지정 탭 오른쪽 탭들 닫기
 */
export function closeTabsToRight(
  tabId: number,
  openTabs: number[],
  activeTab: number | null,
  setOpenTabs: Setter<number[]>,
  setActiveTab: Setter<number | null>,
  setDirtyItems: Setter<Set<number>>,
) {
  const idx = openTabs.indexOf(tabId)
  if (idx === -1) return
  const toClose = openTabs.slice(idx + 1)
  const next = openTabs.slice(0, idx + 1)
  setOpenTabs(next)
  if (activeTab !== null && toClose.includes(activeTab)) {
    setActiveTab(tabId)
  }
  setDirtyItems((prev) => {
    const s = new Set(prev)
    toClose.forEach((id) => s.delete(id))
    return s
  })
}

/**
 * 지정 탭 왼쪽 탭들 닫기
 */
export function closeTabsToLeft(
  tabId: number,
  openTabs: number[],
  activeTab: number | null,
  setOpenTabs: Setter<number[]>,
  setActiveTab: Setter<number | null>,
  setDirtyItems: Setter<Set<number>>,
) {
  const idx = openTabs.indexOf(tabId)
  if (idx === -1) return
  const toClose = openTabs.slice(0, idx)
  const next = openTabs.slice(idx)
  setOpenTabs(next)
  if (activeTab !== null && toClose.includes(activeTab)) {
    setActiveTab(tabId)
  }
  setDirtyItems((prev) => {
    const s = new Set(prev)
    toClose.forEach((id) => s.delete(id))
    return s
  })
}

/**
 * dirty 아닌(저장된) 탭들만 닫기
 */
export function closeSavedTabs(
  dirtyItems: Set<number>,
  openTabs: number[],
  activeTab: number | null,
  setOpenTabs: Setter<number[]>,
  setActiveTab: Setter<number | null>,
) {
  const toClose = openTabs.filter((id) => !dirtyItems.has(id))
  const next = openTabs.filter((id) => dirtyItems.has(id))
  setOpenTabs(next)
  if (activeTab !== null && toClose.includes(activeTab)) {
    setActiveTab(next.length > 0 ? next[next.length - 1] : null)
  }
}

/**
 * 모든 탭 닫기
 */
export function closeAllTabs(
  setOpenTabs: Setter<number[]>,
  setActiveTab: Setter<number | null>,
  setDirtyItems: Setter<Set<number>>,
) {
  setOpenTabs([])
  setActiveTab(null)
  setDirtyItems(new Set<number>())
}
