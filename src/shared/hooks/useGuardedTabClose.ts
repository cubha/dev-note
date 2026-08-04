// src/shared/hooks/useGuardedTabClose.ts
//
// 명시적 탭 닫기(단일/다른탭/오른쪽/왼쪽/전체)의 단일 진입점.
// dirty 탭이 포함되면 즉시 닫지 않고 pendingCloseAtom에 등록해 CloseConfirmDialog가
// 3버튼(저장/저장 안 함/취소) confirm을 띄우게 한다. dirty가 없으면 바로 닫는다.

import { useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  openTabsAtom, activeTabAtom, dirtyItemsAtom, pendingCloseAtom,
} from '../../store/atoms'
import {
  closeTab, closeOtherTabs, closeTabsToRight, closeTabsToLeft, closeAllTabs,
  computeDirtyTargets,
} from '../../store/tabHelpers'
import type { CloseKind } from '../../store/tabHelpers'

export function useGuardedTabClose() {
  const openTabs = useAtomValue(openTabsAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const dirtyItems = useAtomValue(dirtyItemsAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const setPendingClose = useSetAtom(pendingCloseAtom)

  /** confirm 없이 즉시 실행 — CloseConfirmDialog의 저장/저장안함 처리 후에도 사용 */
  const executeClose = useCallback((kind: CloseKind, tabId: number | null) => {
    switch (kind) {
      case 'single':
        if (tabId !== null) closeTab(tabId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
        break
      case 'others':
        if (tabId !== null) closeOtherTabs(tabId, openTabs, setOpenTabs, setActiveTab, setDirtyItems)
        break
      case 'right':
        if (tabId !== null) closeTabsToRight(tabId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
        break
      case 'left':
        if (tabId !== null) closeTabsToLeft(tabId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
        break
      case 'all':
        closeAllTabs(setOpenTabs, setActiveTab, setDirtyItems)
        break
    }
  }, [openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems])

  /** 닫기 요청 — dirty 탭이 있으면 confirm 등록, 없으면 즉시 실행 */
  const requestClose = useCallback((kind: CloseKind, tabId: number | null) => {
    const dirtyTargets = computeDirtyTargets(kind, tabId, openTabs, dirtyItems)
    if (dirtyTargets.length === 0) {
      executeClose(kind, tabId)
      return
    }
    setPendingClose({ kind, tabId, dirtyTabIds: dirtyTargets })
  }, [openTabs, dirtyItems, executeClose, setPendingClose])

  return { requestClose, executeClose }
}
