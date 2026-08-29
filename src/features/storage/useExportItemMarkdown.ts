// src/features/storage/useExportItemMarkdown.ts
//
// 카드 1건 md 저장의 공용 진입점(F3 확장). 진입점이 3곳(카드 상세 `.md` 버튼 ·
// 탭 우클릭 메뉴 · 카드 ⋯ 메뉴)이라 잠금 거부 문구·성공 토스트까지 여기서 통일한다.
// 저장 규칙 자체는 exportItemAsMarkdown이 갖고, 이 훅은 키 주입 + 사용자 피드백만 담당한다.

import { useCallback } from 'react'
import { useAtomValue } from 'jotai'
import { toast } from 'sonner'
import type { Item } from '../../core/db'
import { encryptionKeyAtom } from '../../store/atoms'
import { exportItemAsMarkdown } from './exportMarkdown'

export function useExportItemMarkdown(): (item: Item) => Promise<void> {
  const encryptionKey = useAtomValue(encryptionKeyAtom)

  return useCallback(
    async (item: Item) => {
      // 복호화 실패(키가 있으나 맞지 않는 구버전 암호문 등)와 파일 쓰기 실패는 여기로 던져진다.
      // 잡지 않으면 호출부가 전부 `void exportMd(item)`이라 조용한 unhandled rejection이 된다.
      // (사용자 취소는 던지지 않고 'cancelled'로 온다 — 실패로 알리지 않는다.)
      let result: Awaited<ReturnType<typeof exportItemAsMarkdown>>
      try {
        result = await exportItemAsMarkdown(item, encryptionKey)
      } catch {
        toast.error('md 저장에 실패했습니다.', { duration: 3000 })
        return
      }
      if (result.status === 'locked') {
        toast.error('잠긴 카드는 md로 저장할 수 없습니다 — 설정 → 보안에서 잠금을 해제해 주세요.', {
          duration: 3000,
        })
        return
      }
      if (result.status === 'saved') {
        toast.success(`${result.fileName} 저장됨`, { duration: 2000 })
      }
      // 'cancelled'(FSAA 피커 취소)는 조용히 무시 — 기존 StorageButtons 패턴과 동일
    },
    [encryptionKey],
  )
}
