// src/features/admin/AdminMetrics.tsx
//
// AI 사용량 축소판 대시보드 (admin 전용, 숨김).
// 접근: URL 해시 '#admin'. 토큰은 메모리 전용(영속 저장 안 함).
// 표시: 메타데이터만(호출 수·모델 분포·실패율·일별). 노트 평문은 애초에 집계되지 않음.

import { useState, useEffect, useCallback } from 'react'
import { SHARED_API_URL } from '../../store/atoms'

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
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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

      // 방문 통계는 선택적 — 미설정(503)·실패 시 섹션만 생략, AI 지표는 유지
      try {
        const vres = await fetch(`${SHARED_API_URL}/v1/visits`, {
          headers: { 'X-Admin-Token': token },
        })
        setVisits(vres.ok ? ((await vres.json()) as Visits) : null)
      } catch {
        setVisits(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
      setData(null)
      setVisits(null)
    } finally {
      setLoading(false)
    }
  }, [token])

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
            <h2 className="text-sm font-semibold text-[var(--text-secondary)]">방문 통계 <span className="font-normal">(최근 30일)</span></h2>

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

            {/* 최근 7일 */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">최근 7일 방문</h3>
              <div className="rounded border border-[var(--border-default)]">
                {visits.daily.map((d) => (
                  <div key={d.date} className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-1.5 text-sm last:border-0">
                    <span className="font-mono text-xs">{d.date}</span>
                    <span className="tabular-nums text-[var(--text-secondary)]">방문 {d.views}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
