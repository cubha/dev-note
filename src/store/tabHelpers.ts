// src/store/tabHelpers.ts
//
// 탭 열기/닫기 헬퍼 — Jotai atom setter를 받아 상태를 갱신

import type { SetStateAction } from 'jotai'

type Setter<T> = (update: SetStateAction<T>) => void

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
