/**
 * POST /v1/messages — Claude API 프록시
 *
 * Vercel Edge Function (non-Cloudflare 인프라 → CF WAF 차단 회피)
 * - 모델 화이트리스트 + max_tokens 상한
 * - IP rate limit (Upstash Redis, 미설정 시 스킵)
 * - 지수 백오프 + 지터 재시도 (403, 429, 529)
 * - Anthropic 에러 분류 → 클라이언트 친화적 응답
 */

export const config = { runtime: 'edge' }

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

const ALLOWED_ORIGINS = [
  'https://cubha.github.io',
  'http://localhost:3001',
]

const ALLOWED_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
]
const MAX_TOKENS_LIMIT = 4096

const RETRYABLE_STATUSES = [403, 429, 529]
const MAX_RETRIES = 3
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 4000
const JITTER_MS = 500

// ── 유틸 ─────────────────────────────────────────────────────

function getRetryDelay(attempt: number): number {
  const exponential = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS)
  return exponential + Math.random() * JITTER_MS
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? 'unknown'
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonResponse(body: Record<string, unknown>, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}

function jsonError(message: string, status: number, origin: string, code?: string): Response {
  return jsonResponse({ error: message, ...(code ? { code } : {}) }, status, origin)
}

// ── Rate Limit (Upstash Redis) ──────────────────────────────

async function checkAndIncrementRateLimit(ip: string, dailyLimit: number): Promise<{ allowed: boolean; count: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return { allowed: true, count: 0 } // 미설정 시 스킵

  const today = new Date().toISOString().slice(0, 10)
  const key = `rl:${ip}:${today}`

  try {
    // GET current count
    const getRes = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const getData = await getRes.json() as { result: string | null }
    const count = getData.result ? parseInt(getData.result, 10) : 0

    if (count >= dailyLimit) return { allowed: false, count }

    // INCR + EXPIRE (pipeline)
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 90000]]),
    })

    return { allowed: true, count: count + 1 }
  } catch {
    // Redis 에러 시 요청은 허용 (graceful degradation)
    return { allowed: true, count: 0 }
  }
}

// ── Anthropic 에러 분류 ─────────────────────────────────────

interface AnthropicError {
  error?: { type?: string; message?: string }
}

function classifyAnthropicError(
  status: number, body: string, origin: string, requestId: string, retries: number,
): Response {
  // Cloudflare WAF challenge 감지 (HTML 응답)
  if (body.includes('<!DOCTYPE') || body.includes('<html')) {
    return jsonError(
      `Cloudflare WAF 차단이 감지되었습니다. (${retries}회 재시도 후 실패, request-id: ${requestId})`,
      403, origin, 'cloudflare_challenge',
    )
  }

  let parsed: AnthropicError = {}
  try { parsed = JSON.parse(body) as AnthropicError } catch { /* ignore */ }

  const type = parsed.error?.type ?? ''
  const msg = parsed.error?.message ?? ''
  const debug = ` (retries: ${retries}, request-id: ${requestId})`

  if (status === 401) return jsonError(`API 키가 유효하지 않습니다.${msg ? ` (${msg})` : ''}${debug}`, 401, origin, 'auth_error')
  if (status === 403) return jsonError(`API 키 권한이 부족합니다.${msg ? ` (${msg})` : ''}${debug}`, 403, origin, 'permission_error')
  if (status === 429) return jsonError(`Anthropic API 호출 한도를 초과했습니다.${debug}`, 429, origin, 'anthropic_rate_limit')
  if (status === 529) return jsonError(`Claude 서버가 과부하 상태입니다.${debug}`, 503, origin, 'overloaded')

  if (status === 400) {
    if (msg.toLowerCase().includes('credit')) return jsonError('API 크레딧이 소진되었습니다.', 402, origin, 'credit_exhausted')
    if (type === 'invalid_request_error' && msg.toLowerCase().includes('token')) {
      return jsonError('입력 텍스트가 너무 깁니다. 텍스트를 줄여주세요.', 400, origin, 'input_too_long')
    }
    return jsonError(`요청 오류: ${msg.slice(0, 200)}`, 400, origin, 'invalid_request')
  }

  return jsonError(`Claude API 오류 (${status}): ${msg.slice(0, 200)}${debug}`, status, origin, 'unknown')
}

// ── 핸들러 ──────────────────────────────────────────────────

export default async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get('Origin') ?? ''

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden', { status: 403 })
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) })
  }

  // ── Rate Limit ──────────────────────────────────────────────
  const ip = getClientIp(request)
  const dailyLimit = parseInt(process.env.DAILY_LIMIT ?? '50', 10)
  const { allowed } = await checkAndIncrementRateLimit(ip, dailyLimit)

  if (!allowed) {
    return jsonError(
      `일일 한도(${dailyLimit}회)를 초과했습니다. 내일 다시 시도해주세요.`,
      429, origin, 'daily_limit_exceeded',
    )
  }

  // ── 요청 본문 파싱 + 검증 ──────────────────────────────────
  let parsed: Record<string, unknown>
  try {
    parsed = await request.json() as Record<string, unknown>
  } catch {
    return jsonError('요청 본문 파싱 실패', 400, origin, 'parse_error')
  }

  if (!ALLOWED_MODELS.includes(parsed.model as string)) {
    return jsonError(`허용되지 않은 모델: ${parsed.model}`, 400, origin, 'invalid_model')
  }

  if (typeof parsed.max_tokens !== 'number' || parsed.max_tokens > MAX_TOKENS_LIMIT) {
    parsed.max_tokens = MAX_TOKENS_LIMIT
  }

  // ── Claude API 프록시 (지수 백오프 + 지터 재시도) ──────────
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    return jsonError('서버 설정 오류: API 키가 구성되지 않았습니다.', 500, origin, 'config_error')
  }

  const requestBody = JSON.stringify(parsed)
  let claudeResponse: Response = undefined!
  let responseBody = ''
  let lastRequestId = ''

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    claudeResponse = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        'user-agent': 'dev-note-api/1.0',
        'accept': 'application/json',
      },
      body: requestBody,
    })

    responseBody = await claudeResponse.text()
    lastRequestId = claudeResponse.headers.get('request-id') ?? ''

    if (claudeResponse.ok || !RETRYABLE_STATUSES.includes(claudeResponse.status)) break

    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, getRetryDelay(attempt)))
    }
  }

  if (!claudeResponse.ok) {
    return classifyAnthropicError(claudeResponse.status, responseBody, origin, lastRequestId, MAX_RETRIES)
  }

  return new Response(responseBody, {
    status: claudeResponse.status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  })
}
