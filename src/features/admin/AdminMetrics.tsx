// src/features/admin/AdminMetrics.tsx
//
// AI 사용량 축소판 대시보드 (admin 전용, 숨김).
// 접근: URL 해시 '#admin'. 토큰은 메모리 전용(영속 저장 안 함).
// 표시: 메타데이터만(호출 수·모델 분포·실패율·일별). 노트 평문은 애초에 집계되지 않음.

import { useState, useEffect, useCallback, useRef } from 'react'
import { SHARED_API_URL } from '../../store/atoms'
import { bucketVisitSeries, buildYAxisTicks, type ChartPeriod } from '../../shared/utils/visitChartBucket'

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

/** 방문 통계 섹션의 표시 상태 — 'idle'일 때만 섹션을 감춘다.
 *  로딩·실패를 침묵 생략하면 "기능이 없는 것"으로 오인되므로 idle 외에는 항상 무언가를 보여준다. */
type VisitsStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

export const AdminMetrics = () => {
  const active = useHashActive('#admin')
  const [token, setToken] = useState('')
  const [data, setData] = useState<Metrics | null>(null)
  const [visits, setVisits] = useState<Visits | null>(null)
  const [visitPeriod, setVisitPeriod] = useState<ChartPeriod>('30d')
  const [visitsStatus, setVisitsStatus] = useState<VisitsStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // 기간 버튼을 빠르게 연타하면 응답이 요청 순서대로 오지 않는다 — 마지막 요청만 상태를
  // 반영하도록 시퀀스로 가드한다(늦게 온 이전 기간 응답이 현재 기간 데이터·로딩을 덮어쓰는 것 차단).
  const visitSeqRef = useRef(0)

  // 방문 통계는 선택적 — 미설정(503)·실패해도 AI 지표는 무관하게 유지된다
  const loadVisits = useCallback(async (period: ChartPeriod, tok: string) => {
    if (!SHARED_API_URL) return
    const seq = ++visitSeqRef.current
    setVisitsStatus('loading')
    try {
      const vres = await fetch(`${SHARED_API_URL}/v1/visits?period=${period}`, {
        headers: { 'X-Admin-Token': tok },
      })
      const parsed = vres.ok ? ((await vres.json()) as Visits) : null
      if (seq !== visitSeqRef.current) return
      setVisits(parsed)
      setVisitsStatus(parsed ? 'ready' : 'unavailable')
    } catch {
      if (seq !== visitSeqRef.current) return
      setVisits(null)
      setVisitsStatus('unavailable')
    }
  }, [])

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    // AI 지표를 기다렸다가 방문 통계를 요청하면 섹션이 눈에 띄게 늦게 뜬다 — 두 요청을 동시에 띄운다.
    const visitsPromise = loadVisits(visitPeriod, token)
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
      setData(null)
      // 토큰 오류 등 조회 자체가 실패한 경우 방문 통계 실패는 중복 노이즈다 — 섹션을 접는다.
      // 병렬 요청이 끝난 뒤에 리셋해야 뒤늦은 setState가 이 리셋을 덮어쓰지 않는다.
      await visitsPromise
      setVisits(null)
      setVisitsStatus('idle')
    } finally {
      await visitsPromise
      setLoading(false)
    }
  }, [token, visitPeriod, loadVisits])

  const handlePeriodChange = (period: ChartPeriod) => {
    setVisitPeriod(period)
    void loadVisits(period, token)
  }

  const visitsRefetching = visitsStatus === 'loading' && visits !== null

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

        {error && <p className="text-sm text-[var(--text-error)]">{error}</p>}

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

        {visitsStatus !== 'idle' && (
          <div className="space-y-5">
            {/* 헤더는 로딩·실패 중에도 항상 유지한다 — 기간 버튼이 사라지거나 리마운트되면
                방금 누른 버튼이 없어지고, 섹션 자체가 없는 것처럼 보인다. */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--text-secondary)]">방문 통계</h2>
                {visitsStatus === 'loading' && (
                  <span role="status" className="text-xs text-[var(--text-tertiary)]">불러오는 중…</span>
                )}
              </div>

              {/* 기간 선택 — 로딩 중에도 활성. 늦게 온 응답은 시퀀스 가드가 버린다 */}
              <div role="group" aria-label="조회 기간" className="flex rounded border border-[var(--border-default)] overflow-hidden">
                {PERIOD_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={visitPeriod === opt.value}
                    onClick={() => handlePeriodChange(opt.value)}
                    className={
                      visitPeriod === opt.value
                        ? 'px-2.5 py-1 text-xs bg-[var(--accent)] text-white'
                        : 'px-2.5 py-1 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {visitsStatus === 'unavailable' ? (
              <p className="rounded border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]">
                방문 통계를 불러오지 못했습니다 — 집계 연동이 설정되지 않았거나 일시적으로 조회에 실패했습니다.
              </p>
            ) : visits === null ? (
              <VisitsSkeleton />
            ) : (
              <div
                aria-busy={visitsRefetching}
                className={`space-y-5 transition-opacity ${visitsRefetching ? 'opacity-40' : 'opacity-100'}`}
              >
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
        )}
      </div>
    </div>
  )
}

// ── 방문 추이 차트 (제로디펜던시 CSS 바 차트) ────────────────
// day 기간(7d/30d/90d)은 일별, week 기간(1y/all)은 주별로 버킷팅해 라벨 과밀을 방지한다.
const CHART_HEIGHT = 96
const Y_AXIS_WIDTH = 36
const Y_LABEL_LINE = 10 // text-[10px] + leading-none

/** 눈금 라벨을 격자선 "중앙"에 맞추기 위한 보정 — justify-between은 라벨의 위/아래 끝을
 *  플롯 영역 끝에 붙이므로, 한 줄 높이만큼 컬럼을 늘리고 절반을 위로 당겨 중심을 일치시킨다. */
const Y_LABEL_COLUMN_STYLE = {
  height: CHART_HEIGHT + Y_LABEL_LINE,
  width: Y_AXIS_WIDTH,
  marginTop: -Y_LABEL_LINE / 2,
} as const

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

  const ticks = buildYAxisTicks(Math.max(...buckets.map((b) => b.views)))
  const top = ticks[0]

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">방문 추이</h3>
      <div className="rounded border border-[var(--border-default)] p-3">
        <div className="flex items-start gap-2" style={{ height: CHART_HEIGHT }}>
          {/* y축 눈금값 (위→아래: 최대값·중간값·0) */}
          <div
            aria-hidden="true"
            className="flex shrink-0 flex-col justify-between text-right text-[10px] leading-none tabular-nums text-[var(--text-tertiary)]"
            style={Y_LABEL_COLUMN_STYLE}
          >
            {ticks.map((t) => (
              <span key={t}>{t.toLocaleString()}</span>
            ))}
          </div>

          {/* 플롯 영역 — 격자선은 눈금과 같은 비율 위치에 깔고 막대를 그 위에 올린다 */}
          <div className="relative flex-1" style={{ height: CHART_HEIGHT }}>
            {ticks.map((t, i) => (
              <div
                key={t}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--border-subtle)]"
                style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-0.5">
              {buckets.map((b) => (
                <div
                  key={b.label}
                  title={`${b.label}: 방문 ${b.views.toLocaleString()}`}
                  className="min-w-[2px] min-h-[2px] flex-1 rounded-t bg-[var(--accent)] transition-colors hover:bg-[var(--accent-hover)]"
                  style={{ height: `${(b.views / top) * 100}%` }}
                />
              ))}
            </div>
          </div>
        </div>
        <div
          className="mt-2.5 flex justify-between text-[10px] text-[var(--text-tertiary)]"
          style={{ paddingLeft: Y_AXIS_WIDTH + 8 }}
        >
          <span>{buckets[0].label}</span>
          {buckets.length > 1 && <span>{buckets[buckets.length - 1].label}</span>}
        </div>
      </div>
    </section>
  )
}

// ── 로딩 스켈레톤 ────────────────────────────────────────────
// 무작위 높이를 쓰면 리렌더마다 막대가 요동친다 — 고정 패턴으로 "로딩 중"만 전달한다.
const SKELETON_BARS = [34, 58, 42, 71, 48, 82, 63, 37, 66, 51, 76, 45]

const VisitsSkeleton = () => (
  <div className="space-y-5" aria-hidden="true">
    <div className="grid grid-cols-2 gap-3">
      {['총 방문', '총 이벤트'].map((label) => (
        <div key={label} className="rounded border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
          <div className="text-xs text-[var(--text-secondary)]">{label}</div>
          <div className="mt-1 h-7 w-20 animate-pulse rounded bg-[var(--border-subtle)]" />
        </div>
      ))}
    </div>
    <section>
      <h3 className="mb-2 text-sm font-semibold">방문 추이</h3>
      <div className="rounded border border-[var(--border-default)] p-3">
        <div className="flex items-start gap-2" style={{ height: CHART_HEIGHT }}>
          <div className="shrink-0" style={{ width: Y_AXIS_WIDTH }} />
          <div className="flex flex-1 items-end gap-0.5" style={{ height: CHART_HEIGHT }}>
            {SKELETON_BARS.map((h, i) => (
              <div
                key={i}
                className="flex-1 animate-pulse rounded-t bg-[var(--border-subtle)]"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="mt-2.5 h-[10px]" />
      </div>
    </section>
    <section>
      <h3 className="mb-2 text-sm font-semibold">경로별</h3>
      <div className="rounded border border-[var(--border-default)]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-3 py-2 last:border-0">
            <div className="h-3 w-32 animate-pulse rounded bg-[var(--border-subtle)]" />
            <div className="h-3 w-10 animate-pulse rounded bg-[var(--border-subtle)]" />
          </div>
        ))}
      </div>
    </section>
  </div>
)
