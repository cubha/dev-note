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

// 최근 n일 날짜(YYYY-MM-DD), 최신 우선.
function lastNDates(n: number): string[] {
  const out: string[] = []
  const base = Date.now()
  for (let i = 0; i < n; i++) {
    out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

// GoatCounter가 요구하는 "시(hour)로 반올림된" date-time 문자열.
function isoHour(ms: number): string {
  return new Date(ms).toISOString().slice(0, 13) + ':00:00Z'
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

  // ── 방문 통계 조회 (최근 30일 윈도우) ──────────────────────
  try {
    const now = Date.now()
    const start = isoHour(now - 30 * 86_400_000)
    const end = isoHour(now)
    const q = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`

    const totalRes = (await gc(`/api/v0/stats/total?${q}`)) as
      | { total?: unknown; total_events?: unknown }
      | null
    const total = toNum(totalRes?.total)
    const totalEvents = toNum(totalRes?.total_events)

    const hitsRes = (await gc(`/api/v0/stats/hits?${q}&daily=true&limit=100`)) as
      | { hits?: unknown }
      | null
    const rawHits = Array.isArray(hitsRes?.hits) ? (hitsRes?.hits as unknown[]) : []

    // 경로별 카운트 + 일별 합산(여러 경로의 같은 날을 누적; SPA라 사실상 단일 경로)
    const dayMap = new Map<string, number>()
    const paths: Array<{ path: string; title: string; count: number }> = []
    for (const h of rawHits) {
      if (typeof h !== 'object' || h === null) continue
      const hit = h as { path?: unknown; title?: unknown; count?: unknown; stats?: unknown }
      paths.push({
        path: typeof hit.path === 'string' ? hit.path : '',
        title: typeof hit.title === 'string' ? hit.title : '',
        count: toNum(hit.count),
      })
      if (Array.isArray(hit.stats)) {
        for (const s of hit.stats) {
          if (typeof s !== 'object' || s === null) continue
          const st = s as { day?: unknown; daily?: unknown }
          if (typeof st.day === 'string') {
            dayMap.set(st.day, (dayMap.get(st.day) ?? 0) + toNum(st.daily))
          }
        }
      }
    }
    paths.sort((a, b) => b.count - a.count)

    const daily = lastNDates(7).map((date) => ({ date, views: dayMap.get(date) ?? 0 }))

    return json({ total, totalEvents, paths: paths.slice(0, 20), daily }, 200, origin)
  } catch {
    return json({ error: '방문 통계 조회 실패' }, 502, origin)
  }
}
