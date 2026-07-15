/**
 * GET /v1/visits — 방문 통계 조회 (admin 전용)
 *
 * Vercel Edge Function
 * - 인증: X-Admin-Token 헤더를 METRICS_ADMIN_TOKEN 환경변수와 서버측 비교 (metrics.ts와 동일 게이트 재사용).
 * - 데이터 출처: GoatCounter Reporting API. 수집은 GoatCounter에 위임(픽셀 비콘, analytics.ts)하고
 *   여기서는 읽기만 프록시한다 → 매 방문 자체 저장 부담 없음.
 * - zero-knowledge 정합: GoatCounter는 경로/방문수 메타데이터만 보유(노트 평문·제목 미전송). 그 메타만 반환.
 * - GOATCOUNTER_API_TOKEN은 서버 env에만 보관 → 클라이언트 미노출. 미설정 시 503(프론트는 방문 섹션만 생략).
 */

export const config = { runtime: 'edge' }

const ALLOWED_ORIGINS = [
  'https://cubha.github.io',
  'http://localhost:3001',
]

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  }
}

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

// 상수 시간 문자열 비교 (토큰 타이밍 공격 방어). 길이 노출은 무해(랜덤 토큰).
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function toNum(v: unknown): number {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : 0
  return Number.isFinite(n) ? n : 0
}

// startMs~endMs 사이 날짜(YYYY-MM-DD) 오름차순 — 차트 x축이 시간순으로 흐르도록.
function dateRange(startMs: number, endMs: number): string[] {
  const out: string[] = []
  const startDay = Math.floor(startMs / 86_400_000)
  const endDay = Math.floor(endMs / 86_400_000)
  for (let d = startDay; d <= endDay; d++) {
    out.push(new Date(d * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

// GoatCounter가 요구하는 "시(hour)로 반올림된" date-time 문자열.
function isoHour(ms: number): string {
  return new Date(ms).toISOString().slice(0, 13) + ':00:00Z'
}

// 조회 기간 프리셋 — 'all'은 GoatCounter 계정 생성 이전 구간이라도 안전하게(공백=0) 처리되므로
// 정확한 가입일을 몰라도 넉넉한 lookback(3년)으로 "도입 시점부터 전체"를 커버한다.
const PERIOD_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, all: 1095 }
const DEFAULT_PERIOD = '30d'

function resolvePeriod(raw: string | null): string {
  return raw !== null && Object.hasOwn(PERIOD_DAYS, raw) ? raw : DEFAULT_PERIOD
}

// ── GoatCounter Reporting API (REST) ───────────────────────
async function gc(path: string): Promise<unknown> {
  const base = process.env.GOATCOUNTER_API_URL
  const token = process.env.GOATCOUNTER_API_TOKEN
  if (!base || !token) return null
  const res = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`goatcounter ${res.status}`)
  return (await res.json()) as unknown
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('Origin') ?? ''

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (request.method !== 'GET') {
    return json({ error: 'Method Not Allowed' }, 405, origin)
  }

  // ── admin 토큰 게이트 (metrics.ts와 동일) ──────────────────
  const adminToken = process.env.METRICS_ADMIN_TOKEN
  if (!adminToken) {
    return json({ error: '계측 대시보드가 설정되지 않았습니다 (METRICS_ADMIN_TOKEN 미설정)' }, 503, origin)
  }
  const provided = request.headers.get('X-Admin-Token') ?? ''
  if (!safeEqual(provided, adminToken)) {
    return json({ error: '인증 실패' }, 401, origin)
  }

  // ── GoatCounter 설정 게이트 ────────────────────────────────
  if (!process.env.GOATCOUNTER_API_URL || !process.env.GOATCOUNTER_API_TOKEN) {
    return json({ error: '방문 계측이 설정되지 않았습니다 (GOATCOUNTER_API_URL/TOKEN 미설정)' }, 503, origin)
  }

  // ── 방문 통계 조회 (기간 선택형 윈도우) ─────────────────────
  try {
    const period = resolvePeriod(new URL(request.url).searchParams.get('period'))
    const now = Date.now()
    const startMs = now - PERIOD_DAYS[period] * 86_400_000
    const start = isoHour(startMs)
    const end = isoHour(now)
    const q = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`

    // /stats/total의 stats[]가 일자별 daily 값을 직접 제공 — 경로별 합산 불필요(더 정확·단순).
    const totalRes = (await gc(`/api/v0/stats/total?${q}`)) as
      | { total?: unknown; total_events?: unknown; stats?: unknown }
      | null
    const total = toNum(totalRes?.total)
    const totalEvents = toNum(totalRes?.total_events)

    const dayMap = new Map<string, number>()
    if (Array.isArray(totalRes?.stats)) {
      for (const s of totalRes.stats) {
        if (typeof s !== 'object' || s === null) continue
        const st = s as { day?: unknown; daily?: unknown }
        if (typeof st.day === 'string') {
          dayMap.set(st.day, toNum(st.daily))
        }
      }
    }
    // GoatCounter가 무방문일을 생략할 수 있어 시작~끝을 gapless하게 0으로 채운다(차트 x축 일관성).
    const daily = dateRange(startMs, now).map((date) => ({ date, views: dayMap.get(date) ?? 0 }))

    // 경로별 — 동일 period 윈도우로 조회해 페이지 전체가 같은 기간을 보도록 한다.
    const hitsRes = (await gc(`/api/v0/stats/hits?${q}&limit=100`)) as { hits?: unknown } | null
    const rawHits = Array.isArray(hitsRes?.hits) ? (hitsRes.hits as unknown[]) : []
    const paths: Array<{ path: string; title: string; count: number }> = []
    for (const h of rawHits) {
      if (typeof h !== 'object' || h === null) continue
      const hit = h as { path?: unknown; title?: unknown; count?: unknown }
      paths.push({
        path: typeof hit.path === 'string' ? hit.path : '',
        title: typeof hit.title === 'string' ? hit.title : '',
        count: toNum(hit.count),
      })
    }
    paths.sort((a, b) => b.count - a.count)

    return json({ total, totalEvents, period, paths: paths.slice(0, 20), daily }, 200, origin)
  } catch {
    return json({ error: '방문 통계 조회 실패' }, 502, origin)
  }
}
