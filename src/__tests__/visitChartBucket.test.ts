import { describe, it, expect } from 'vitest'
import { bucketVisitSeries } from '../shared/utils/visitChartBucket'

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
