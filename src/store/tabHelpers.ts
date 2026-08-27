// src/store/tabHelpers.ts
//
// 탭 열기/닫기/삭제 헬퍼 — Jotai atom setter를 받아 상태를 갱신
// 일괄 닫기: closeOtherTabs, closeTabsToRight, closeTabsToLeft, closeSavedTabs, closeAllTabs

import type { SetStateAction } from 'jotai'
import { deleteDrafts } from '../core/draftStore'
import { bumpDraftEpoch } from '../features/cards/draftFlushControl'

type Setter<T> = (update: SetStateAction<T>) => void

/** 명시적 닫기 종류 — 3버튼 confirm 대상 판정에 사용 */
export type CloseKind = 'single' | 'others' | 'right' | 'left' | 'all'

/**
 * 지정된 닫기 동작(kind)이 실제로 닫게 될 탭 전체(dirty 여부 무관)를 반환.
 * close*() 각 함수의 candidate 계산과 동일 규칙 — 단일 소스.
 */
export function computeClosingTabs(
  kind: CloseKind,
  tabId: number | null,
  openTabs: number[],
): number[] {
  switch (kind) {
    case 'single':
      return tabId !== null && openTabs.includes(tabId) ? [tabId] : []
    case 'others':
      return tabId === null ? [] : openTabs.filter((id) => id !== tabId)
    case 'right': {
      if (tabId === null) return []
      const idx = openTabs.indexOf(tabId)
      return idx === -1 ? [] : openTabs.slice(idx + 1)
    }
    case 'left': {
      if (tabId === null) return []
      const idx = openTabs.indexOf(tabId)
      return idx === -1 ? [] : openTabs.slice(0, idx)
    }
    case 'all':
      return openTabs
  }
}

/**
 * 지정된 닫기 동작(kind)이 실제로 닫게 될 탭 중 dirty(미저장)인 것만 반환.
 * 빈 배열이면 confirm 없이 즉시 닫아도 안전.
 */
export function computeDirtyTargets(
  kind: CloseKind,
  tabId: number | null,
  openTabs: number[],
  dirtyItems: Set<number>,
): number[] {
  return computeClosingTabs(kind, tabId, openTabs).filter((id) => dirtyItems.has(id))
}

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
  // 아이템 자체가 삭제되므로 드래프트도 함께 정리 — 모든 삭제 경로가 이 함수를 거치므로 여기 한 곳이면 충분.
  // epoch을 먼저 올려, 삭제 직전 시작된 암호화 flush(encrypt await 중)가 뒤늦게 도착해도 폐기되게 한다.
  ids.forEach((id) => bumpDraftEpoch(id))
  void deleteDrafts(ids)
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
