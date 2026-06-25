/**
 * GET /v1/metrics — AI 사용량 집계 조회 (admin 전용)
 *
 * Vercel Edge Function
 * - 인증: X-Admin-Token 헤더를 METRICS_ADMIN_TOKEN 환경변수와 서버측 비교.
 *   (영구 설계 — DevNote는 OAuth 위임이라 자체 계정/role이 없음. 토큰 게이트가 최종형)
 * - zero-knowledge 정합: 노트 평문·제목은 애초에 집계되지 않음. 메타데이터(호출 수·모델 분포·실패)만 반환.
 * - 데이터 출처: messages.ts가 기록한 Upstash Redis 집계 키(m:calls:*, m:model:*, m:fail:*)
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

// ── Upstash Redis (REST) ────────────────────────────────────
async function redis(cmd: Array<string>): Promise<unknown> {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return null
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  const data = (await res.json()) as { result?: unknown }
  return data.result ?? null
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

function lastNDates(n: number): string[] {
  const out: string[] = []
  const base = Date.now()
  for (let i = 0; i < n; i++) {
    out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('Origin') ?? ''

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }
  if (request.method !== 'GET') {
    return json({ error: 'Method Not Allowed' }, 405, origin)
  }

  // ── admin 토큰 게이트 ──────────────────────────────────────
  const adminToken = process.env.METRICS_ADMIN_TOKEN
  if (!adminToken) {
    return json({ error: '계측 대시보드가 설정되지 않았습니다 (METRICS_ADMIN_TOKEN 미설정)' }, 503, origin)
  }
  const provided = request.headers.get('X-Admin-Token') ?? ''
  if (!safeEqual(provided, adminToken)) {
    return json({ error: '인증 실패' }, 401, origin)
  }

  // ── 집계 조회 ──────────────────────────────────────────────
  try {
    const callsTotal = toNum(await redis(['GET', 'm:calls:total']))
    const failTotal = toNum(await redis(['GET', 'm:fail:total']))

    // 모델 분포 — KEYS로 m:model:* 열거 후 MGET
    const modelKeys = ((await redis(['KEYS', 'm:model:*'])) as string[] | null) ?? []
    const models: Record<string, number> = {}
    if (modelKeys.length > 0) {
      const counts = ((await redis(['MGET', ...modelKeys])) as unknown[] | null) ?? []
      modelKeys.forEach((k, i) => {
        models[k.replace('m:model:', '')] = toNum(counts[i])
      })
    }

    // 최근 7일 일별 호출/실패
    const dates = lastNDates(7)
    const dailyCallKeys = dates.map((d) => `m:calls:${d}`)
    const dailyFailKeys = dates.map((d) => `m:fail:${d}`)
    const callVals = ((await redis(['MGET', ...dailyCallKeys])) as unknown[] | null) ?? []
    const failVals = ((await redis(['MGET', ...dailyFailKeys])) as unknown[] | null) ?? []
    const daily = dates.map((date, i) => ({
      date,
      calls: toNum(callVals[i]),
      fail: toNum(failVals[i]),
    }))

    return json(
      { callsTotal, failTotal, failRate: callsTotal > 0 ? failTotal / callsTotal : 0, models, daily },
      200,
      origin,
    )
  } catch {
    return json({ error: '집계 조회 실패' }, 502, origin)
  }
}
