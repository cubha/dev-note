// src/__tests__/tabWindow.test.ts
//
// 탭바 표시 창 계산 — 활성 탭(특히 새로 연 탭)이 항상 보이는지가 핵심 회귀 대상.

import { describe, it, expect } from 'vitest'
import { computeTabWindow } from '../features/dashboard/tabWindow'

const BTN = 44
const W = 100 // 모든 탭 폭을 100으로 고정해 계산을 눈으로 검증 가능하게 한다

/** 폭 100짜리 탭 n개 */
const tabs = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

const win = (tabIds: number[], activeTab: number | null, available: number) =>
  computeTabWindow({
    tabIds,
    activeTab,
    available,
    widthOf: () => W,
    overflowBtnW: BTN,
  })

describe('computeTabWindow', () => {
  it('탭이 없으면 빈 창', () => {
    expect(win([], null, 800)).toEqual({ start: 0, end: 0 })
  })

  it('전부 들어가면 자르지 않는다 (오버플로 버튼 자리도 필요 없다)', () => {
    // 탭 3개 = 300, 마지막 탭은 버튼 자리를 예약하지 않으므로 300이면 충분
    expect(win(tabs(3), 1, 300)).toEqual({ start: 0, end: 3 })
  })

  it('폭이 모자라면 뒤를 자르고 오버플로 버튼 자리를 남긴다', () => {
    // 400 안에서: 탭1(100+44=144 ok) 탭2(200+44=244 ok) 탭3(300+44=344 ok) 탭4는 마지막이라 400+0=400 ok
    expect(win(tabs(4), 1, 400)).toEqual({ start: 0, end: 4 })
    // 350이면 탭4(마지막, 400>350)가 안 들어가 잘린다
    expect(win(tabs(4), 1, 350)).toEqual({ start: 0, end: 3 })
  })

  it('활성 탭이 뒤에 있으면 창을 뒤로 밀어 반드시 보이게 한다', () => {
    // 탭 10개, 폭 350 → start=0이면 end=3이라 활성탭(인덱스 9)이 안 보인다
    const r = win(tabs(10), 10, 350)
    expect(r.start).toBeLessThanOrEqual(9)
    expect(r.end).toBeGreaterThan(9)
  })

  it('새로 연 탭(맨 뒤 + 활성)은 언제나 창 안에 들어온다 — 이 버그의 회귀 케이스', () => {
    for (let n = 1; n <= 30; n++) {
      const ids = tabs(n)
      const newest = ids[n - 1]
      const r = win(ids, newest, 350)
      const visible = ids.slice(r.start, r.end)
      expect(visible).toContain(newest)
    }
  })

  it('활성 탭이 앞쪽이면 창을 앞에 붙여 둔다 (불필요하게 밀지 않는다)', () => {
    expect(win(tabs(10), 1, 350).start).toBe(0)
  })

  it('활성 탭이 없으면 앞에서부터 채운다', () => {
    expect(win(tabs(10), null, 350)).toEqual({ start: 0, end: 3 })
  })

  it('활성 탭이 목록에 없으면 앞에서부터 채운다', () => {
    expect(win(tabs(10), 999, 350)).toEqual({ start: 0, end: 3 })
  })

  it('폭이 탭 하나도 못 담을 만큼 좁아도 최소 1개는 보인다', () => {
    const r = win(tabs(5), 3, 10)
    expect(r.end - r.start).toBe(1)
    expect(r.start).toBe(2) // 활성 탭(인덱스 2)이 그 1개다
  })

  it('창이 뒤로 밀리면 앞쪽 숨김에도 버튼 자리를 예약한다', () => {
    // start>0이면 마지막 탭에도 버튼 자리가 필요하다
    // 탭 4개, 활성=탭4(인덱스 3), 폭 250 → start=0은 end=2라 활성탭 미포함 → 밀린다
    const r = win(tabs(4), 4, 250)
    expect(r.start).toBeGreaterThan(0)
    expect(r.end).toBe(4)
    // 보이는 탭 폭 합 + 버튼 ≤ 250
    expect((r.end - r.start) * W + BTN).toBeLessThanOrEqual(250)
  })

  it('폭이 넓어지면 다시 앞쪽으로 돌아온다 (창이 고착되지 않는다)', () => {
    const ids = tabs(6)
    expect(win(ids, 6, 250).start).toBeGreaterThan(0)
    expect(win(ids, 6, 600).start).toBe(0) // 6개*100=600, 마지막은 버튼 자리 불필요
  })

  it('어떤 탭 수·폭에서도 창은 유효 범위를 벗어나지 않는다', () => {
    for (let n = 1; n <= 30; n++) {
      for (const available of [10, 120, 350, 800, 5000]) {
        for (const active of [null, 1, Math.ceil(n / 2), n]) {
          const r = win(tabs(n), active, available)
          expect(r.start).toBeGreaterThanOrEqual(0)
          expect(r.end).toBeGreaterThan(r.start)
          expect(r.end).toBeLessThanOrEqual(n)
        }
      }
    }
  })

  it('보이는 탭 + 숨은 탭 = 전체 (TabBar의 양쪽 slice가 빠뜨리거나 겹치지 않는다)', () => {
    for (let n = 1; n <= 30; n++) {
      const ids = tabs(n)
      const r = win(ids, n, 350)
      const visible = ids.slice(r.start, r.end)
      const hidden = [...ids.slice(0, r.start), ...ids.slice(r.end)]
      expect(visible.length + hidden.length).toBe(n)
      expect([...hidden, ...visible].sort((a, b) => a - b)).toEqual(ids)
    }
  })

  it('탭 폭이 제각각이어도 활성 탭을 포함한다', () => {
    const ids = [1, 2, 3, 4, 5]
    const widths: Record<number, number> = { 1: 200, 2: 60, 3: 180, 4: 90, 5: 140 }
    const r = computeTabWindow({
      tabIds: ids,
      activeTab: 5,
      available: 300,
      widthOf: (id) => widths[id],
      overflowBtnW: BTN,
    })
    expect(ids.slice(r.start, r.end)).toContain(5)
  })
})

// ── R4~R8 앵커 기반 규칙 ─────────────────────────────────────────────
//
// 배경: 기존 알고리즘은 stateless라 활성 탭이 항상 창 오른쪽 끝에 강제 배치됐다.
// 실측 결함(탭10개/폭350): 보이는 탭 8을 클릭만 해도 창이 [8,9,10]→[6,7,8]로 밀려
// 나중에 연 9·10이 오버플로로 숨었다("먼저 연 것부터 숨는다" 규칙 위반).
// anchorTabId/anchorIndex로 이전 창의 왼쪽 끝을 넘겨주면, 활성 탭이 그 창 안에
// 있는 한 창이 움직이지 않아야 한다.

const winA = (
  tabIds: number[],
  activeTab: number | null,
  available: number,
  anchorTabId: number | null,
  anchorIndex: number,
) => computeTabWindow({
  tabIds, activeTab, available, widthOf: () => W, overflowBtnW: BTN, anchorTabId, anchorIndex,
})

describe('computeTabWindow — R4 앵커 유지(창 안 탭 클릭 시 창 고정)', () => {
  it('보이는 탭을 클릭해도 창이 움직이지 않는다 — ②의 회귀 케이스', () => {
    // 탭 10개, 폭 350 → 창 [8,9,10](start=7). 그 안의 탭 8을 클릭.
    const ids = tabs(10)
    const r = winA(ids, 8, 350, 8, 7)
    expect(r).toEqual({ start: 7, end: 10 })
  })

  it('창 안의 다른 탭(9, 가운데)을 클릭해도 마찬가지로 고정된다', () => {
    // 주의: 탭 7은 창 [8,9,10] 밖(왼쪽 바로 옆)이라 이 불변식의 대상이 아니다 — 탭 9로 검증한다
    const ids = tabs(10)
    const r = winA(ids, 9, 350, 8, 7)
    expect(r).toEqual({ start: 7, end: 10 })
  })
})

describe('computeTabWindow — R5 최소 이동', () => {
  it('창 밖 뒤쪽(신규 탭)은 보이는 맨 오른쪽에 온다', () => {
    // 창 [8,9,10](앵커=8,idx=7) 상태에서 탭 11을 새로 열어 활성화
    const ids = tabs(11)
    const r = winA(ids, 11, 350, 8, 7)
    expect(ids.slice(r.start, r.end)).toContain(11)
    expect(ids[r.end - 1]).toBe(11) // 맨 오른쪽
  })

  it('창 밖 앞쪽(오버플로 선택)은 보이는 맨 왼쪽에 온다 — ④의 과잉이동 해소', () => {
    // 창 [8,9,10](앵커=8,idx=7) 상태에서 오버플로 메뉴의 탭 2를 선택
    const ids = tabs(10)
    const r = winA(ids, 2, 350, 8, 7)
    expect(ids[r.start]).toBe(2) // 맨 왼쪽 — 맨 앞(1)까지 과잉 이동하지 않는다
    expect(ids.slice(r.start, r.end)).toContain(2)
  })
})

describe('computeTabWindow — R6 여유 회수', () => {
  it('오른쪽 끝까지 보이는데 왼쪽에 여유가 있으면 되채운다', () => {
    const ids = [1, 2, 3, 4, 5]
    // 앵커가 뒤쪽(idx=3)에 있어도, 폭이 넉넉하면(550) 전부 보이도록 회수해야 한다
    const r = winA(ids, 5, 550, 4, 3)
    expect(r).toEqual({ start: 0, end: 5 })
  })
})

describe('computeTabWindow — R8 앵커 소실 시 위치 보존', () => {
  it('앵커 탭이 닫혀도 0으로 리셋하지 않고 index를 승계한다', () => {
    // 이전 창 [8,9,10](앵커=8,idx=7) 상태에서 앵커 탭 8이 닫힘 → 9개 남음
    const after = [1, 2, 3, 4, 5, 6, 7, 9, 10]
    const r = winA(after, 9, 350, 8, 7)
    const visible = after.slice(r.start, r.end)
    // fallback=0이면 [6,7,9]가 되어 나중에 연 10이 숨는다(R3 위반) — 실측 검증된 결함
    expect(visible).not.toContain(6)
    expect(visible).toContain(10) // 나중에 연 탭이 부활한 앞쪽 탭에 밀려나면 안 된다
    expect(visible).toContain(9)
  })
})

describe('computeTabWindow — 시퀀스 시뮬레이션 (실사용 흐름)', () => {
  /** 매 스텝의 출력 start를 다음 스텝의 앵커로 되먹이는 실제 TabBar 배선 재현 */
  function simulate(available: number) {
    let tabIds: number[] = []
    let anchor: { id: number | null; index: number } = { id: null, index: 0 }
    let lastWindow = { start: 0, end: 0 }

    const step = (activeTab: number | null) => {
      const r = computeTabWindow({
        tabIds, activeTab, available, widthOf: () => W, overflowBtnW: BTN,
        anchorTabId: anchor.id, anchorIndex: anchor.index,
      })
      lastWindow = r
      anchor = { id: tabIds[r.start] ?? null, index: r.start }
      return r
    }

    return {
      open: (id: number) => { tabIds = [...tabIds, id]; return step(id) },
      click: (id: number) => step(id),
      close: (id: number) => { tabIds = tabIds.filter((x) => x !== id); return step(id) },
      resize: (newAvailable: number, activeTab: number | null) => {
        available = newAvailable
        return step(activeTab)
      },
      get tabIds() { return tabIds },
      get window() { return lastWindow },
    }
  }

  it('open×10 → click 8 → click 9 → 오버플로에서 2 선택 → 새 탭 11 → 앵커 탭 닫기 → 폭 확대', () => {
    const s = simulate(350)
    for (let i = 1; i <= 10; i++) s.open(i)
    expect(s.tabIds.slice(s.window.start, s.window.end)).toEqual([8, 9, 10])

    // 불변식 1: 보이는 탭을 클릭하면 {start,end}가 변하지 않는다 (탭 7은 창 밖이라 대상에서 제외)
    const w1 = s.click(8)
    expect(w1).toEqual({ start: 7, end: 10 })
    const w2 = s.click(9)
    expect(w2).toEqual({ start: 7, end: 10 })

    // 오버플로에서 2 선택 — 창이 앞으로 이동
    const w3 = s.click(2)
    expect(s.tabIds[w3.start]).toBe(2)

    // 새 탭 11 — 보이는 맨 오른쪽에 위치
    const w4 = s.open(11)
    expect(s.tabIds[w4.end - 1]).toBe(11)

    // 불변식 2: 창이 뒤로 밀리는 동안 숨김(뒤쪽) 집합은 커지지 않는다 — 숨김은 왼쪽에서만 자란다
    const hiddenBefore = s.tabIds.length - w3.end
    const hiddenAfterRight = s.tabIds.length - w4.end
    expect(hiddenAfterRight).toBeLessThanOrEqual(hiddenBefore + 1) // 새 탭 1개 추가분 이상 뒤쪽이 밀리지 않는다

    // 앵커 탭(현재 창의 맨 왼쪽) 닫기 — 위치 보존(R8) 확인
    const anchorId = s.tabIds[s.window.start]
    const w5 = s.close(anchorId)
    expect(s.tabIds.slice(w5.start, w5.end)).not.toContain(1) // 먼저 닫힌 앞쪽 탭이 부활하지 않는다

    // 폭 확대 — R6 여유 회수로 왼쪽이 다시 채워질 수 있다(활성 탭은 여전히 포함)
    const w6 = s.resize(2000, s.tabIds[s.tabIds.length - 1])
    expect(w6).toEqual({ start: 0, end: s.tabIds.length })
  })

  it('idempotence — 동일 입력을 반복 계산해도 고정점에서 흔들리지 않는다', () => {
    const ids = tabs(12)
    let anchor: { id: number | null; index: number } = { id: null, index: 0 }
    let prev: { start: number; end: number } | null = null
    for (let i = 0; i < 5; i++) {
      const r = computeTabWindow({
        tabIds: ids, activeTab: 9, available: 350, widthOf: () => W, overflowBtnW: BTN,
        anchorTabId: anchor.id, anchorIndex: anchor.index,
      })
      if (prev) expect(r).toEqual(prev)
      prev = r
      anchor = { id: ids[r.start] ?? null, index: r.start }
    }
  })
})
