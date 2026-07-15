// src/shared/utils/visitChartBucket.ts
//
// 방문 통계 차트 표시용 버킷팅 — day 단위 기간(7d/30d/90d)은 그대로,
// week 단위 기간(1y/all)은 7일씩 합산해 x축 라벨 과밀을 방지한다.

export interface DailyPoint {
  date: string
  views: number
}

export interface ChartBucket {
  label: string
  views: number
}

export type ChartPeriod = '7d' | '30d' | '90d' | '1y' | 'all'

const WEEK_PERIODS = new Set<ChartPeriod>(['1y', 'all'])

export function bucketVisitSeries(daily: DailyPoint[], period: ChartPeriod): ChartBucket[] {
  if (!WEEK_PERIODS.has(period)) {
    return daily.map((d) => ({ label: d.date, views: d.views }))
  }

  const buckets: ChartBucket[] = []
  for (let i = 0; i < daily.length; i += 7) {
    const week = daily.slice(i, i + 7)
    buckets.push({
      label: week[0].date,
      views: week.reduce((sum, d) => sum + d.views, 0),
    })
  }
  return buckets
}
