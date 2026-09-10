// src/shared/hooks/useRevealOnSearch.ts

import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAtomValue } from 'jotai'
import { isPathUnder } from '../../core/cardSearch'
import { cardSearchActivePathAtom } from '../../store/atoms'

/**
 * SSR(renderToStaticMarkup)에서는 layout effect가 돌 수 없어 React가 경고를 낸다.
 * `cardSearch.domContract.test.tsx`가 이 컴포넌트들을 서버 렌더로 검사하므로 갈아끼운다.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * 카드 전역 검색이 `prefix` 아래를 가리키면 스스로 펼친다.
 *
 * 미리보기 모드·MD변환 모드·접힌 메모는 검색 호스트(`data-search-path`)를 **언마운트**시키는데,
 * 그 토글은 각 컴포넌트의 로컬 state라 검색기가 밖에서 열 수 없다(접힌 섹션은 sections 데이터에
 * 있어 expandSection으로 열리는 것과 다르다). 그래서 신호를 내려보내고 여는 쪽이 반응한다.
 *
 * **layout effect인 이유**: `focusMatch`는 requestAnimationFrame 안에서 호스트를 조회한다.
 * 펼침이 passive effect로 돌면 그 커밋이 rAF보다 늦어 "펼쳐졌는데 포커스는 안 감"이 된다
 * (실측으로 확인된 증상 — 2프레임 재시도로도 못 잡았다). layout effect의 state 갱신은
 * 페인트 전에 동기로 반영되므로 rAF가 볼 때는 이미 호스트가 있다.
 */
export const useRevealOnSearch = (
  prefix: string | undefined,
  hidden: boolean,
  reveal: () => void,
) => {
  const activePath = useAtomValue(cardSearchActivePathAtom)
  const prevPath = useRef<string | null>(null)

  useIsomorphicLayoutEffect(() => {
    const changed = activePath !== prevPath.current
    prevPath.current = activePath
    if (!prefix || !hidden) return
    // **대상이 바뀔 때 1회만** 편다. 조건을 계속 강제하면 검색이 이 위젯을 가리키는 동안
    // 사용자가 미리보기·MD변환을 켜는 즉시 되돌려져 토글이 죽는다(실측으로 확인된 회귀).
    if (changed && isPathUnder(activePath, prefix)) reveal()
    // deps에 reveal은 넣지 않는다 — 매 렌더 새 함수라 넣으면 매번 재실행된다. 판정 입력만 본다.
  }, [activePath, prefix, hidden])
}
