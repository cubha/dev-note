/**
 * POST /v1/error-report — Discord webhook 에러 리포트
 *
 * Vercel Edge Function
 * - IP rate limit (Upstash Redis, 일일 10건)
 * - Discord embed 형식으로 전송
 */

export const config = { runtime: 'edge' }

const ALLOWED_ORIGINS = [
  'https://cubha.github.io',
  'http://localhost:3001',
]

const ERROR_REPORT_DAILY_LIMIT = 10

// ── 유틸 ─────────────────────────────────────────────────────

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

function jsonError(message: string, status: number, origin: string, code?: string): Response {
  return new Response(
    JSON.stringify({ error: message, ...(code ? { code } : {}) }),
    { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
  )
}

// ── Rate Limit (에러 리포트 전용) ────────────────────────────

async function checkErrorReportLimit(ip: string): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return true // 미설정 시 스킵

  const today = new Date().toISOString().slice(0, 10)
  const key = `er:${ip}:${today}`

  try {
    const getRes = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const getData = await getRes.json() as { result: string | null }
    const count = getData.result ? parseInt(getData.result, 10) : 0

    if (count >= ERROR_REPORT_DAILY_LIMIT) return false

    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 90000]]),
    })

    return true
  } catch {
    return true
  }
}

// ── Discord webhook ─────────────────────────────────────────

async function sendDiscordWebhook(webhookUrl: string, report: Record<string, unknown>): Promise<boolean> {
  const embed = {
    title: 'Smart Paste 오류 리포트',
    color: 0xff4444,
    fields: [
      { name: '에러 코드', value: String(report.code ?? 'unknown'), inline: true },
      { name: 'HTTP 상태', value: String(report.status ?? '-'), inline: true },
      { name: '모델', value: String(report.model ?? '-'), inline: true },
      { name: '에러 메시지', value: String(report.message ?? '-').slice(0, 1024) },
      { name: '카드 타입', value: String(report.cardType ?? '-'), inline: true },
      { name: '시각 (UTC)', value: String(report.timestamp ?? new Date().toISOString()), inline: true },
    ],
    footer: { text: 'dev-note error reporter (vercel)' },
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

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    return jsonError('에러 리포트 기능이 설정되지 않았습니다.', 503, origin, 'webhook_not_configured')
  }

  const ip = getClientIp(request)
  const allowed = await checkErrorReportLimit(ip)
  if (!allowed) {
    return jsonError('에러 리포트 일일 한도를 초과했습니다.', 429, origin, 'report_limit_exceeded')
  }

  let report: Record<string, unknown>
  try {
    report = await request.json() as Record<string, unknown>
  } catch {
    return jsonError('요청 본문 파싱 실패', 400, origin, 'parse_error')
  }

  const ok = await sendDiscordWebhook(webhookUrl, report)
  if (!ok) {
    return jsonError('Discord 전송에 실패했습니다.', 502, origin, 'webhook_failed')
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } },
  )
}
