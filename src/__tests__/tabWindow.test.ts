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
