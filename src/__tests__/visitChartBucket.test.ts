import { describe, it, expect } from 'vitest'
import { bucketVisitSeries, buildYAxisTicks } from '../shared/utils/visitChartBucket'

describe('bucketVisitSeries', () => {
  it('7d/30d/90d(day 단위 기간)는 1:1로 그대로 통과한다', () => {
    const daily = [
      { date: '2026-07-01', views: 3 },
      { date: '2026-07-02', views: 5 },
    ]
    expect(bucketVisitSeries(daily, '7d')).toEqual([
      { label: '2026-07-01', views: 3 },
      { label: '2026-07-02', views: 5 },
    ])
    expect(bucketVisitSeries(daily, '30d')).toEqual([
      { label: '2026-07-01', views: 3 },
      { label: '2026-07-02', views: 5 },
    ])
    expect(bucketVisitSeries(daily, '90d')).toEqual([
      { label: '2026-07-01', views: 3 },
      { label: '2026-07-02', views: 5 },
    ])
  })

  it('1y/all(week 단위 기간)는 7일씩 합산하고 라벨은 주 시작일이다', () => {
    const daily = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      views: 1,
    }))
    expect(bucketVisitSeries(daily, '1y')).toEqual([
      { label: '2026-07-01', views: 7 },
      { label: '2026-07-08', views: 7 },
    ])
    expect(bucketVisitSeries(daily, 'all')).toEqual([
      { label: '2026-07-01', views: 7 },
      { label: '2026-07-08', views: 7 },
    ])
  })

  it('7의 배수가 아닌 마지막 부분 주도 버리지 않고 합산한다', () => {
    const daily = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      views: 2,
    }))
    const result = bucketVisitSeries(daily, '1y')
    expect(result).toEqual([
      { label: '2026-07-01', views: 14 },
      { label: '2026-07-08', views: 6 },
    ])
  })

  it('빈 배열 입력 → 빈 배열 출력', () => {
    expect(bucketVisitSeries([], '7d')).toEqual([])
    expect(bucketVisitSeries([], 'all')).toEqual([])
  })

  it('day 단위 기간도 views 합산 없이 원본 값을 유지한다(1:1이므로 합산 없음 검증)', () => {
    const daily = [
      { date: '2026-07-01', views: 0 },
      { date: '2026-07-02', views: 100 },
    ]
    expect(bucketVisitSeries(daily, '90d')).toEqual([
      { label: '2026-07-01', views: 0 },
      { label: '2026-07-02', views: 100 },
    ])
  })
})

describe('buildYAxisTicks', () => {
  it('최대값·중간값·0을 위에서 아래 순서로 낸다', () => {
    expect(buildYAxisTicks(100)).toEqual([100, 50, 0])
    expect(buildYAxisTicks(18)).toEqual([18, 9, 0])
  })

  it('홀수 최대값의 중간값은 반올림한다', () => {
    expect(buildYAxisTicks(7)).toEqual([7, 4, 0])
    expect(buildYAxisTicks(3)).toEqual([3, 2, 0])
  })

  it('최대값 1 이하는 중간값이 겹치므로 최대·0 2개만 낸다', () => {
    expect(buildYAxisTicks(1)).toEqual([1, 0])
    expect(buildYAxisTicks(0)).toEqual([1, 0])
  })

  it('최대값 2는 중간값 1이 겹치지 않으므로 3개를 낸다', () => {
    expect(buildYAxisTicks(2)).toEqual([2, 1, 0])
  })

  it('눈금은 항상 정수이고 내림차순이다', () => {
    for (const max of [1, 2, 5, 9, 13, 47, 1234]) {
      const ticks = buildYAxisTicks(max)
      expect(ticks.every((t) => Number.isInteger(t))).toBe(true)
      expect([...ticks].sort((a, b) => b - a)).toEqual(ticks)
      expect(ticks[0]).toBe(max)
      expect(ticks[ticks.length - 1]).toBe(0)
    }
  })
})
