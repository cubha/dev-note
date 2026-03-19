/**
 * dev-note Claude API 프록시 Worker
 *
 * - Claude API 키를 환경변수에 보관 (브라우저 노출 없음)
 * - IP당 일일 rate limit (KV Store)
 * - CORS 처리
 */

export interface Env {
  CLAUDE_API_KEY: string
  RATE_LIMIT_KV: KVNamespace
  DAILY_LIMIT: string
}

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// KV 키 형식: "rl:{ip}:{YYYY-MM-DD}"
function getRateLimitKey(ip: string): string {
  const today = new Date().toISOString().slice(0, 10) // "2026-03-19"
  return `rl:${ip}:${today}`
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '*'

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // POST /v1/messages 만 허용
    const url = new URL(request.url)
    if (request.method !== 'POST' || url.pathname !== '/v1/messages') {
      return new Response('Not Found', { status: 404, headers: corsHeaders(origin) })
    }

    // ── IP Rate Limit ────────────────────────────────────────
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const kvKey = getRateLimitKey(ip)
    const dailyLimit = parseInt(env.DAILY_LIMIT ?? '50', 10)

    const countStr = await env.RATE_LIMIT_KV.get(kvKey)
    const count = countStr ? parseInt(countStr, 10) : 0

    if (count >= dailyLimit) {
      return new Response(
        JSON.stringify({ error: `일일 한도(${dailyLimit}회)를 초과했습니다. 내일 다시 시도해주세요.` }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        },
      )
    }

    // ── Claude API 프록시 ─────────────────────────────────────
    let body: string
    try {
      body = await request.text()
    } catch {
      return new Response(JSON.stringify({ error: '요청 본문 파싱 실패' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const claudeResponse = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body,
    })

    // rate limit 카운터 증가 (TTL: 25시간 — 자정 넘어도 여유있게 만료)
    await env.RATE_LIMIT_KV.put(kvKey, String(count + 1), { expirationTtl: 90000 })

    const responseBody = await claudeResponse.text()

    return new Response(responseBody, {
      status: claudeResponse.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin),
      },
    })
  },
}
