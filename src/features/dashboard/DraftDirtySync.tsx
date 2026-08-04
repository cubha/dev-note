// src/features/dashboard/DraftDirtySync.tsx
//
// dirtyItemsAtom을 drafts 테이블 존재 여부와 반응형으로 동기화한다.
// CardDetailEditor는 activeTab 하나의 dirty만 직접 관리하므로(즉각적 뱃지 피드백 유지),
// 재부팅 직후나 백그라운드(비활성) 탭의 뱃지는 이 컴포넌트가 drafts 테이블을 관찰해 채운다.
// App 루트에 1회만 마운트한다.

import { useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSetAtom } from 'jotai'
import { listDraftItemIds } from '../../core/draftStore'
import { dirtyItemsAtom } from '../../store/atoms'

export const DraftDirtySync = () => {
  const draftIds = useLiveQuery(() => listDraftItemIds(), [])
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  // 직전에 union한 draft id 집합 — "드래프트가 사라진" id만 골라 제거하기 위한 기준.
  // 암호화 카드처럼 drafts에 없는 항목은 CardDetailEditor가 직접 관리하므로 여기서 절대 안 건드린다.
  const prevDraftIdsRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!draftIds) return
    const nextDraftIds = new Set(draftIds)
    const prevDraftIds = prevDraftIdsRef.current

    setDirtyItems((current) => {
      const merged = new Set(current)
      for (const id of nextDraftIds) merged.add(id)
      for (const id of prevDraftIds) {
        if (!nextDraftIds.has(id)) merged.delete(id)
      }
      return merged
    })

    prevDraftIdsRef.current = nextDraftIds
  }, [draftIds, setDirtyItems])

  return null
}
