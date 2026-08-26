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
  /** 이전에 계산된 창의 왼쪽 끝 탭 id — 창이 불필요하게 움직이지 않도록 하는 기준점(R4). 없으면 맨 앞부터 */
  anchorTabId?: number | null
  /** anchorTabId가 목록에서 사라졌을 때(탭 닫힘 등) 승계할 인덱스(R8) */
  anchorIndex?: number
}

/**
 * 활성 탭이 항상 보이는 표시 창을 계산한다.
 *
 * 규칙:
 * - R1 순서 불변 — tabIds 배열 순서 자체는 건드리지 않는다(호출부 책임).
 * - R2 신규 탭은 배열 맨 뒤에 붙는 동시에 활성 탭이 되므로, 아래 규칙만으로 항상 보이게 된다.
 * - R3 숨김은 왼쪽부터 — 넘치면 먼저 열린 쪽(왼쪽)부터 오버플로로 넘어간다. 넘친 상태의 기본형은
 *   "오른쪽 끝이 보이는 창"이다.
 * - R4 앵커 유지 — 창은 anchorTabId(이전 창의 왼쪽 끝)에서 출발한다. 활성 탭이 그 창 안에 있으면
 *   창은 움직이지 않는다(탭을 클릭만 해서는 창이 흔들리지 않는다).
 * - R5 최소 이동 — 활성 탭이 창 밖일 때만 이동한다. 뒤쪽(신규 탭 등)이면 보이는 맨 오른쪽에 오도록
 *   밀고, 앞쪽(오버플로 선택)이면 보이는 맨 왼쪽에 오도록 당긴다.
 * - R6 여유 회수 — 뒤가 끝까지 보이는데(end===total) 앞에 폭 여유가 있으면 왼쪽을 다시 채운다.
 *   창을 넓히는 방향으로만 움직이므로 이미 보이는 활성 탭을 밀어낼 수 없다.
 * - R7 활성 탭이 없거나 목록에 없으면 앵커를 그대로 유지한다(정지).
 * - R8 앵커 소실 시 위치 보존 — anchorTabId가 더 이상 없으면(탭이 닫힘) 0으로 리셋하지 않고
 *   anchorIndex를 새 길이에 clamp해 승계한다. 0으로 리셋하면 먼저 닫힌 앞쪽 탭이 되살아나 R3를 깬다.
 * - 폭이 아무리 좁아도 최소 1개는 보인다.
 */
export function computeTabWindow({
  tabIds, activeTab, available, widthOf, overflowBtnW, anchorTabId = null, anchorIndex = 0,
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

  // R4/R8: 앵커에서 출발. id가 살아있으면 그 위치, 사라졌으면 index를 새 길이에 clamp해 승계.
  const anchorIdxRaw = anchorTabId !== null ? tabIds.indexOf(anchorTabId) : -1
  const anchorIdx = anchorIdxRaw !== -1 ? anchorIdxRaw : Math.max(0, Math.min(anchorIndex, total - 1))

  let start = anchorIdx

  // R5 왼쪽: 활성 탭이 앵커보다 앞이면 보이는 맨 왼쪽에 오도록 당긴다
  if (activeIdx !== -1 && activeIdx < start) start = activeIdx

  let end = fillFrom(start)

  // R5 오른쪽: 활성 탭이 창 밖(뒤)이면 보이는 맨 오른쪽에 오도록 최소 이동
  while (activeIdx !== -1 && end <= activeIdx && start < activeIdx) {
    start++
    end = fillFrom(start)
  }

  // R6 여유 회수: 창을 넓히는 방향으로만 움직이므로 이미 보이는 활성 탭을 밀어낼 수 없다
  while (end === total && start > 0 && fillFrom(start - 1) === total) {
    start--
  }
  end = fillFrom(start)

  return { start, end }
}
