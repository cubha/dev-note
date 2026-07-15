// src/features/admin/AdminMetrics.tsx
//
// AI 사용량 축소판 대시보드 (admin 전용, 숨김).
// 접근: URL 해시 '#admin'. 토큰은 메모리 전용(영속 저장 안 함).
// 표시: 메타데이터만(호출 수·모델 분포·실패율·일별). 노트 평문은 애초에 집계되지 않음.

import { useState, useEffect, useCallback } from 'react'
import { SHARED_API_URL } from '../../store/atoms'
import { bucketVisitSeries, type ChartPeriod } from '../../shared/utils/visitChartBucket'

const PERIOD_OPTIONS: Array<{ value: ChartPeriod; label: string }> = [
  { value: '7d', label: '7일' },
  { value: '30d', label: '30일' },
  { value: '90d', label: '90일' },
  { value: '1y', label: '1년' },
  { value: 'all', label: '전체' },
]

interface Metrics {
  callsTotal: number
  failTotal: number
  failRate: number
  models: Record<string, number>
  daily: Array<{ date: string; calls: number; fail: number }>
}

interface Visits {
  total: number
  totalEvents: number
  period: string
  paths: Array<{ path: string; title: string; count: number }>
  daily: Array<{ date: string; views: number }>
}

function useHashActive(target: string): boolean {
  const [active, setActive] = useState(() => window.location.hash === target)
  useEffect(() => {
    const onHash = () => setActive(window.location.hash === target)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [target])
  return active
}

export const AdminMetrics = () => {
  const active = useHashActive('#admin')
  const [token, setToken] = useState('')
  const [data, setData] = useState<Metrics | null>(null)
  const [visits, setVisits] = useState<Visits | null>(null)
  const [visitPeriod, setVisitPeriod] = useState<ChartPeriod>('30d')
  const [visitsLoading, setVisitsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 방문 통계는 선택적 — 미설정(503)·실패 시 섹션만 생략, AI 지표는 무관하게 유지
  const loadVisits = useCallback(async (period: ChartPeriod, tok: string) => {
    if (!SHARED_API_URL) return
    setVisitsLoading(true)
    try {
      const vres = await fetch(`${SHARED_API_URL}/v1/visits?period=${period}`, {
        headers: { 'X-Admin-Token': tok },
      })
      setVisits(vres.ok ? ((await vres.json()) as Visits) : null)
    } catch {
      setVisits(null)
    } finally {
      setVisitsLoading(false)
    }
  }, [])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      if (!SHARED_API_URL) throw new Error('API URL이 설정되지 않았습니다 (VITE_API_URL)')
      const res = await fetch(`${SHARED_API_URL}/v1/metrics`, {
        headers: { 'X-Admin-Token': token },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `조회 실패 (${res.status})`)
      }
      setData((await res.json()) as Metrics)
      await loadVisits(visitPeriod, token)
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
      setData(null)
      setVisits(null)
    } finally {
      setLoading(false)
    }
  }, [token, visitPeriod, loadVisits])

  const handlePeriodChange = (period: ChartPeriod) => {
    setVisitPeriod(period)
    void loadVisits(period, token)
  }

  if (!active) return null

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[var(--bg-app)] p-6 text-[var(--text-primary)]">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">사용량 대시보드 <span className="text-xs font-normal text-[var(--text-secondary)]">(admin · 메타데이터만)</span></h1>
          <a href="#" className="text-xs text-[var(--text-secondary)] underline">닫기</a>
        </div>

        {/* 토큰 입력 */}
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); void load() }}
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="admin 토큰"
            className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !token}
            className="rounded bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {loading ? '조회 중…' : '조회'}
          </button>
        </form>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {data && (
          <div className="space-y-5">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">AI 사용량</h2>
            {/* 요약 */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '총 호출', value: data.callsTotal.toLocaleString() },
                { label: '실패', value: data.failTotal.toLocaleString() },
                { label: '실패율', value: `${(data.failRate * 100).toFixed(1)}%` },
              ].map((s) => (
                <div key={s.label} className="rounded border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
                  <div className="text-xs text-[var(--text-secondary)]">{s.label}</div>
                  <div className="text-xl font-bold tabular-nums">{s.value}</div>
                </div>
              ))}
            </div>

            {/* 모델 분포 */}
            <section>
              <h2 className="mb-2 text-sm font-semibold">모델 분포</h2>
              <div className="rounded border border-[var(--border-default)]">
                {Object.entries(data.models).length === 0 ? (
                  <p className="p-3 text-xs text-[var(--text-secondary)]">데이터 없음</p>
                ) : (
                  Object.entries(data.models).sort((a, b) => b[1] - a[1]).map(([model, count]) => (
                    <div key={model} className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-1.5 text-sm last:border-0">
                      <span className="font-mono text-xs">{model}</span>
                      <span className="tabular-nums">{count.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* 최근 7일 */}
            <section>
              <h2 className="mb-2 text-sm font-semibold">최근 7일</h2>
              <div className="rounded border border-[var(--border-default)]">
                {data.daily.map((d) => (
                  <div key={d.date} className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-1.5 text-sm last:border-0">
                    <span className="font-mono text-xs">{d.date}</span>
                    <span className="tabular-nums text-[var(--text-secondary)]">호출 {d.calls} · 실패 {d.fail}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {visits && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)]">방문 통계</h2>

              {/* 기간 선택 */}
              <div role="group" aria-label="조회 기간" className="flex rounded border border-[var(--border-default)] overflow-hidden">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={visitPeriod === opt.value}
                    disabled={visitsLoading}
                    onClick={() => handlePeriodChange(opt.value)}
                    className={
                      visitPeriod === opt.value
                        ? 'px-2.5 py-1 text-xs bg-[var(--accent)] text-white'
                        : 'px-2.5 py-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50'
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 요약 */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '총 방문', value: visits.total.toLocaleString() },
                { label: '총 이벤트', value: visits.totalEvents.toLocaleString() },
              ].map((s) => (
                <div key={s.label} className="rounded border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
                  <div className="text-xs text-[var(--text-secondary)]">{s.label}</div>
                  <div className="text-xl font-bold tabular-nums">{s.value}</div>
                </div>
              ))}
            </div>

            {/* 방문 추이 차트 */}
            <VisitTrendChart daily={visits.daily} period={visitPeriod} />

            {/* 경로별 */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">경로별</h3>
              <div className="rounded border border-[var(--border-default)]">
                {visits.paths.length === 0 ? (
                  <p className="p-3 text-xs text-[var(--text-secondary)]">데이터 없음</p>
                ) : (
                  visits.paths.map((p) => (
                    <div key={p.path} className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-1.5 text-sm last:border-0">
                      <span className="truncate font-mono text-xs" title={p.title || p.path}>{p.path || '(기타)'}</span>
                      <span className="tabular-nums">{p.count.toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 방문 추이 차트 (제로디펜던시 CSS 바 차트) ────────────────
// day 기간(7d/30d/90d)은 일별, week 기간(1y/all)은 주별로 버킷팅해 라벨 과밀을 방지한다.
const CHART_HEIGHT = 80

const VisitTrendChart = ({ daily, period }: { daily: Visits['daily']; period: ChartPeriod }) => {
  const buckets = bucketVisitSeries(daily, period)

  if (buckets.length === 0) {
    return (
      <section>
        <h3 className="mb-2 text-sm font-semibold">방문 추이</h3>
        <p className="rounded border border-[var(--border-default)] p-3 text-xs text-[var(--text-secondary)]">데이터 없음</p>
      </section>
    )
  }

  const max = Math.max(1, ...buckets.map((b) => b.views))

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">방문 추이</h3>
      <div className="rounded border border-[var(--border-default)] p-3">
        <div className="flex items-end gap-0.5" style={{ height: CHART_HEIGHT }}>
          {buckets.map((b) => (
            <div
              key={b.label}
              title={`${b.label}: 방문 ${b.views.toLocaleString()}`}
              className="min-w-[2px] flex-1 rounded-t bg-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)]"
              style={{ height: `${Math.max(2, (b.views / max) * CHART_HEIGHT)}px` }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-[var(--text-tertiary)]">
          <span>{buckets[0].label}</span>
          {buckets.length > 1 && <span>{buckets[buckets.length - 1].label}</span>}
        </div>
      </div>
    </section>
  )
}
