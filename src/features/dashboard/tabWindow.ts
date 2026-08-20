// src/features/dashboard/tabWindow.ts
//
// 탭바 표시 창 계산 — 탭 배열 순서는 건드리지 않고 "보여줄 구간 [start, end)"만 정한다.
// 폭 측정(DOM)은 호출부(TabBar)가 하고, 여기서는 주어진 폭으로 계산만 한다.

export interface TabWindow {
  /** 표시 시작 인덱스(포함) */
  start: number
  /** 표시 끝 인덱스(제외) */
  end: number
}

interface ComputeArgs {
  /** 열린 탭 id 배열 — 순서 그대로 */
  tabIds: number[]
  /** 활성 탭 id. 창 안에 반드시 포함된다 */
  activeTab: number | null
  /** 탭바가 쓸 수 있는 가로 폭(px) */
  available: number
  /** 탭 id → 폭(px). 아직 측정 전이면 추정치를 돌려주면 된다 */
  widthOf: (tabId: number) => number
  /** 오버플로 버튼이 차지하는 폭(px) */
  overflowBtnW: number
}

/**
 * 활성 탭이 항상 보이는 표시 창을 계산한다.
 *
 * 규칙:
 * - 앞쪽 탭을 최대한 유지한다(가능하면 start=0). 활성 탭이 안 들어올 때만 창을 뒤로 민다.
 * - 앞이 잘렸거나 뒤가 남으면 오버플로 버튼 자리를 남긴다.
 * - 폭이 아무리 좁아도 최소 1개는 보인다.
 *
 * 새로 연 탭은 배열 맨 뒤에 붙는 동시에 활성 탭이 되므로, 이 규칙만으로 항상 보이게 된다.
 */
export function computeTabWindow({
  tabIds, activeTab, available, widthOf, overflowBtnW,
}: ComputeArgs): TabWindow {
  const total = tabIds.length
  if (total === 0) return { start: 0, end: 0 }

  /** start부터 폭이 허용하는 만큼 채우고 끝 인덱스(exclusive)를 반환 */
  const fillFrom = (start: number): number => {
    let used = 0
    let i = start
    while (i < total) {
      const needsBtn = start > 0 || i < total - 1
      const w = widthOf(tabIds[i])
      if (used + w + (needsBtn ? overflowBtnW : 0) > available) break
      used += w
      i++
    }
    return Math.max(i, start + 1)
  }

  const activeIdx = activeTab !== null ? tabIds.indexOf(activeTab) : -1
  const mustShow = activeIdx === -1 ? 0 : activeIdx

  let start = 0
  let end = fillFrom(0)
  while (end <= mustShow && start < mustShow) {
    start++
    end = fillFrom(start)
  }

  return { start, end }
}
