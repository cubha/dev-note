/**
 * dev-note Claude API 프록시 Worker
 *
 * - Claude API 키를 환경변수에 보관 (브라우저 노출 없음)
 * - CORS Origin 화이트리스트 (허용 도메인만 접근 가능)
 * - 모델 화이트리스트 + max_tokens 상한 (고비용 요청 차단)
 * - IP당 일일 rate limit (KV Store)
 * - Anthropic 에러 분류 → 클라이언트 친화적 응답
 * - 지수 백오프 + 지터 재시도 (Cloudflare WAF 간헐적 차단 대응)
 * - /v1/error-report → Discord webhook 에러 리포트 전달
 */

export interface Env {
  CLAUDE_API_KEY: string
  RATE_LIMIT_KV: KVNamespace
  DAILY_LIMIT: string
  DISCORD_WEBHOOK_URL?: string
}

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// ── 보안: 허용 Origin ────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://cubha.github.io',
  'http://localhost:3001',
]

// ── 보안: 허용 모델 + 토큰 상한 ─────────────────────────────
const ALLOWED_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
]
const MAX_TOKENS_LIMIT = 4096
const ERROR_REPORT_DAILY_LIMIT = 10

// ── 재시도 설정 ──────────────────────────────────────────────
const RETRYABLE_STATUSES = [403, 429, 529]
const MAX_RETRIES = 3
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 4000
const JITTER_MS = 500

// KV 키 형식: "rl:{ip}:{YYYY-MM-DD}"
function getRateLimitKey(ip: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `rl:${ip}:${today}`
}

function getErrorReportKey(ip: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return `er:${ip}:${today}`
}

/** 지수 백오프 + 지터: 500ms → 1000ms → 2000ms (+ 0~500ms 랜덤) */
function getRetryDelay(attempt: number): number {
  const exponential = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS)
  const jitter = Math.random() * JITTER_MS
  return exponential + jitter
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonError(message: string, status: number, origin: string, code?: string): Response {
  return new Response(
    JSON.stringify({ error: message, ...(code ? { code } : {}) }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
  )
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
  try {
    parsed = JSON.parse(body) as AnthropicError
  } catch {
    // body가 JSON이 아니면 그대로 전달
  }

  const type = parsed.error?.type ?? ''
  const msg = parsed.error?.message ?? ''
  const debugSuffix = ` (retries: ${retries}, request-id: ${requestId})`

  if (status === 401) {
    return jsonError(`API 키가 유효하지 않습니다.${msg ? ` (${msg})` : ''}${debugSuffix}`, 401, origin, 'auth_error')
  }

  if (status === 403) {
    return jsonError(`API 키 권한이 부족합니다.${msg ? ` (${msg})` : ''}${debugSuffix}`, 403, origin, 'permission_error')
  }

  if (status === 429) {
    return jsonError(`Anthropic API 호출 한도를 초과했습니다.${debugSuffix}`, 429, origin, 'anthropic_rate_limit')
  }

  if (status === 529) {
    return jsonError(`Claude 서버가 과부하 상태입니다.${debugSuffix}`, 503, origin, 'overloaded')
  }

  if (status === 400) {
    if (msg.toLowerCase().includes('credit')) {
      return jsonError('API 크레딧이 소진되었습니다.', 402, origin, 'credit_exhausted')
    }
    if (type === 'invalid_request_error' && msg.toLowerCase().includes('token')) {
      return jsonError('입력 텍스트가 너무 깁니다. 텍스트를 줄여주세요.', 400, origin, 'input_too_long')
    }
    return jsonError(`요청 오류: ${msg.slice(0, 200)}`, 400, origin, 'invalid_request')
  }

  return jsonError(`Claude API 오류 (${status}): ${msg.slice(0, 200)}${debugSuffix}`, status, origin, 'unknown')
}

// ── Discord webhook 전송 ────────────────────────────────────
async function sendDiscordWebhook(webhookUrl: string, report: Record<string, unknown>): Promise<boolean> {
  const embed = {
    title: `Smart Paste 오류 리포트`,
    color: 0xff4444,
    fields: [
      { name: '에러 코드', value: String(report.code ?? 'unknown'), inline: true },
      { name: 'HTTP 상태', value: String(report.status ?? '-'), inline: true },
      { name: '모델', value: String(report.model ?? '-'), inline: true },
      { name: '에러 메시지', value: String(report.message ?? '-').slice(0, 1024) },
      { name: '카드 타입', value: String(report.cardType ?? '-'), inline: true },
      { name: '시각 (UTC)', value: String(report.timestamp ?? new Date().toISOString()), inline: true },
    ],
    footer: { text: 'dev-note error reporter' },
  }

  if (report.userMessage) {
    embed.fields.push({ name: '사용자 메모', value: String(report.userMessage).slice(0, 1024) })
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  })

  return res.ok
}

// ── 라우터 ─────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? ''

    // ── Origin 검증 ──────────────────────────────────────────
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Forbidden', { status: 403 })
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const url = new URL(request.url)

    if (request.method !== 'POST') {
      return new Response('Not Found', { status: 404, headers: corsHeaders(origin) })
    }

    // ── 라우팅 ────────────────────────────────────────────────
    if (url.pathname === '/v1/messages') {
      return handleMessages(request, env, origin)
    }
    if (url.pathname === '/v1/error-report') {
      return handleErrorReport(request, env, origin)
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders(origin) })
  },
}

// ── /v1/messages 핸들러 ──────────────────────────────────────
async function handleMessages(request: Request, env: Env, origin: string): Promise<Response> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const kvKey = getRateLimitKey(ip)
  const dailyLimit = parseInt(env.DAILY_LIMIT ?? '50', 10)

  const countStr = await env.RATE_LIMIT_KV.get(kvKey)
  const count = countStr ? parseInt(countStr, 10) : 0

  if (count >= dailyLimit) {
    return jsonError(
      `일일 한도(${dailyLimit}회)를 초과했습니다. 내일 다시 시도해주세요.`,
      429, origin, 'daily_limit_exceeded',
    )
  }

  // ── 요청 본문 파싱 + 검증 ────────────────────────────────
  let parsed: Record<string, unknown>
  try {
    parsed = await request.json() as Record<string, unknown>
  } catch {
    return jsonError('요청 본문 파싱 실패', 400, origin, 'parse_error')
  }

  // 모델 화이트리스트 검증
  if (!ALLOWED_MODELS.includes(parsed.model as string)) {
    return jsonError(`허용되지 않은 모델: ${parsed.model}`, 400, origin, 'invalid_model')
  }

  // max_tokens 상한 강제
  if (typeof parsed.max_tokens !== 'number' || parsed.max_tokens > MAX_TOKENS_LIMIT) {
    parsed.max_tokens = MAX_TOKENS_LIMIT
  }

  // ── Claude API 프록시 (지수 백오프 + 지터 재시도) ──────────
  const requestBody = JSON.stringify(parsed)

  let claudeResponse: Response = undefined!
  let responseBody = ''
  let lastRequestId = ''

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    claudeResponse = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
        'user-agent': 'dev-note-worker/1.0',
        'accept': 'application/json',
      },
      body: requestBody,
    })

    responseBody = await claudeResponse.text()
    lastRequestId = claudeResponse.headers.get('request-id') ?? ''

    // 성공이거나 재시도 불가 에러면 즉시 탈출
    if (claudeResponse.ok || !RETRYABLE_STATUSES.includes(claudeResponse.status)) break

    // 마지막 시도가 아니면 지수 백오프 + 지터 대기 후 재시도
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, getRetryDelay(attempt)))
    }
  }

  // rate limit 카운터 증가 (TTL: 25시간 — 자정 넘어도 여유있게 만료)
  await env.RATE_LIMIT_KV.put(kvKey, String(count + 1), { expirationTtl: 90000 })

  // Anthropic 에러 → 분류된 응답
  if (!claudeResponse.ok) {
    return classifyAnthropicError(claudeResponse.status, responseBody, origin, lastRequestId, MAX_RETRIES)
  }

  return new Response(responseBody, {
    status: claudeResponse.status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  })
}

// ── /v1/error-report 핸들러 ──────────────────────────────────
async function handleErrorReport(request: Request, env: Env, origin: string): Promise<Response> {
  // Discord webhook URL 미설정 시 graceful 처리
  if (!env.DISCORD_WEBHOOK_URL) {
    return jsonError('에러 리포트 기능이 설정되지 않았습니다.', 503, origin, 'webhook_not_configured')
  }

  // IP rate limit (에러 리포트 전용)
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const erKey = getErrorReportKey(ip)
  const erCountStr = await env.RATE_LIMIT_KV.get(erKey)
  const erCount = erCountStr ? parseInt(erCountStr, 10) : 0

  if (erCount >= ERROR_REPORT_DAILY_LIMIT) {
    return jsonError('에러 리포트 일일 한도를 초과했습니다.', 429, origin, 'report_limit_exceeded')
  }

  let report: Record<string, unknown>
  try {
    report = await request.json() as Record<string, unknown>
  } catch {
    return jsonError('요청 본문 파싱 실패', 400, origin, 'parse_error')
  }

  const ok = await sendDiscordWebhook(env.DISCORD_WEBHOOK_URL, report)

  if (!ok) {
    return jsonError('Discord 전송에 실패했습니다.', 502, origin, 'webhook_failed')
  }

  // 에러 리포트 카운터 증가
  await env.RATE_LIMIT_KV.put(erKey, String(erCount + 1), { expirationTtl: 90000 })

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
  )
}
