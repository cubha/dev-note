// src/features/dashboard/SessionPersist.tsx
//
// 열린 탭 목록/활성 탭이 바뀔 때마다 localStorage에 기록한다(쓰기 전용).
// 부팅 시 복원(라이브 아이템 필터링·드래프트 병합·GC)은 App.tsx가 담당한다.
// App 루트에 1회만 마운트한다.

import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { openTabsAtom, activeTabAtom } from '../../store/atoms'
import { saveSessionSnapshot } from '../../store/sessionPersist'

export const SessionPersist = () => {
  const openTabs = useAtomValue(openTabsAtom)
  const activeTab = useAtomValue(activeTabAtom)

  useEffect(() => {
    saveSessionSnapshot({ openTabs, activeTab })
  }, [openTabs, activeTab])

  return null
}
