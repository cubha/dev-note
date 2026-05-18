/**
 * POST /v1/messages — LLM 멀티 프로바이더 프록시
 *
 * Vercel Edge Function
 * - 공유 키 모드: IP rate limit (Upstash Redis) + X-RateLimit 헤더 노출
 * - BYOK 모드: X-User-Api-Key + X-Provider 헤더 감지 → rate limit 우회
 *   · anthropic: 직접 전달
 *   · google: Anthropic ↔ Gemini 형식 변환
 *   · openai: Anthropic ↔ ChatCompletions 형식 변환
 */

export const config = { runtime: 'edge' }

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
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

function nextMidnightUTC(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Api-Key, X-Provider',
    'Access-Control-Expose-Headers': 'X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Limit',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  origin: string,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin), ...extra },
  })
}

function jsonError(message: string, status: number, origin: string, code?: string): Response {
  return jsonResponse({ error: message, ...(code ? { code } : {}) }, status, origin)
}

// ── Rate Limit (Vercel KV / Upstash Redis) ─────────────────

async function checkAndIncrementRateLimit(
  ip: string,
  dailyLimit: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return { allowed: true, remaining: dailyLimit }

  const today = new Date().toISOString().slice(0, 10)
  const key = `rl:${ip}:${today}`

  try {
    const getRes = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const getData = await getRes.json() as { result: string | null }
    const count = getData.result ? parseInt(getData.result, 10) : 0

    if (count >= dailyLimit) return { allowed: false, remaining: 0 }

    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 90000]]),
    })

    return { allowed: true, remaining: dailyLimit - count - 1 }
  } catch {
    return { allowed: true, remaining: dailyLimit }
  }
}

// ── 요청/응답 형식 정의 ─────────────────────────────────────

interface AnthropicBody {
  model: string
  max_tokens: number
  system?: string
  messages: Array<{ role: string; content: string }>
  tools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
  tool_choice?: { type: string; name?: string }
}

// ── Google Gemini 변환 ──────────────────────────────────────

function transformToGoogle(
  body: AnthropicBody,
  apiKey: string,
): { url: string; googleBody: Record<string, unknown> } {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:generateContent?key=${apiKey}`

  const contents = body.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const googleBody: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: body.max_tokens },
  }

  if (body.system) {
    googleBody.system_instruction = { parts: [{ text: body.system }] }
  }

  if (body.tools?.length) {
    googleBody.tools = [{
      function_declarations: body.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      })),
    }]
    if (body.tool_choice?.name) {
      googleBody.tool_config = {
        function_calling_config: { mode: 'ANY', allowed_function_names: [body.tool_choice.name] },
      }
    }
  }

  return { url, googleBody }
}

function normalizeGoogleResponse(
  data: Record<string, unknown>,
  model: string,
): Record<string, unknown> {
  const candidates = data.candidates as Array<{
    content: { parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> }
    finishReason?: string
  }> | undefined

  const usage = data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number } | undefined
  const parts = candidates?.[0]?.content?.parts ?? []

  const content: Array<Record<string, unknown>> = []
  for (const part of parts) {
    if (part.functionCall) {
      content.push({ type: 'tool_use', id: `toolu_${Date.now()}`, name: part.functionCall.name, input: part.functionCall.args })
    } else if (part.text) {
      content.push({ type: 'text', text: part.text })
    }
  }

  const stopReason = content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn'

  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    usage: { input_tokens: usage?.promptTokenCount ?? 0, output_tokens: usage?.candidatesTokenCount ?? 0 },
  }
}

// ── OpenAI 변환 ────────────────────────────────────────────

function transformToOpenAI(body: AnthropicBody): Record<string, unknown> {
  const messages: Array<Record<string, unknown>> = []

  if (body.system) messages.push({ role: 'system', content: body.system })
  for (const m of body.messages) messages.push({ role: m.role, content: m.content })

  const openaiBody: Record<string, unknown> = { model: body.model, max_tokens: body.max_tokens, messages }

  if (body.tools?.length) {
    openaiBody.tools = body.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }))
    if (body.tool_choice?.name) {
      openaiBody.tool_choice = { type: 'function', function: { name: body.tool_choice.name } }
    }
  }

  return openaiBody
}

function normalizeOpenAIResponse(
  data: Record<string, unknown>,
  model: string,
): Record<string, unknown> {
  const choices = data.choices as Array<{
    message: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }
    finish_reason?: string
  }> | undefined

  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined
  const message = choices?.[0]?.message
  const finishReason = choices?.[0]?.finish_reason

  const content: Array<Record<string, unknown>> = []

  if (message?.tool_calls?.length) {
    for (const tc of message.tool_calls) {
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.function.arguments) as Record<string, unknown> } catch { /* ignore */ }
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input })
    }
  } else if (message?.content) {
    content.push({ type: 'text', text: message.content })
  }

  const stopReason = finishReason === 'tool_calls' ? 'tool_use' : 'end_turn'

  return {
    id: `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: stopReason,
    usage: { input_tokens: usage?.prompt_tokens ?? 0, output_tokens: usage?.completion_tokens ?? 0 },
  }
}

// ── 에러 분류 ───────────────────────────────────────────────

function classifyByokError(status: number, origin: string, providerName: string): Response {
  if (status === 401 || status === 403) {
    return jsonError('입력한 API 키가 올바르지 않습니다.', 401, origin, 'byok_auth_error')
  }
  if (status === 429) {
    return jsonError('입력한 키의 사용량 한도를 초과했습니다.', 429, origin, 'byok_quota_exceeded')
  }
  return jsonError(`${providerName} API 오류 (${status})`, status, origin, 'unknown')
}

interface AnthropicError {
  error?: { type?: string; message?: string }
}

function classifyAnthropicError(
  status: number, body: string, origin: string, requestId: string, retries: number,
): Response {
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

  // ── BYOK 감지 ──────────────────────────────────────────────
  const userApiKey = request.headers.get('X-User-Api-Key')
  const provider = (request.headers.get('X-Provider') ?? 'anthropic') as 'anthropic' | 'google' | 'openai'
  const isByok = Boolean(userApiKey)

  // ── Rate Limit (공유 키 모드만) ─────────────────────────────
  const dailyLimit = parseInt(process.env.DAILY_LIMIT ?? '20', 10)
  let rateLimitRemaining = dailyLimit

  if (!isByok) {
    const ip = getClientIp(request)
    const { allowed, remaining } = await checkAndIncrementRateLimit(ip, dailyLimit)
    rateLimitRemaining = remaining

    if (!allowed) {
      return jsonError(
        `일일 한도(${dailyLimit}회)를 초과했습니다. 내일 다시 시도해주세요.`,
        429, origin, 'daily_limit_exceeded',
      )
    }
  }

  // ── 요청 본문 파싱 ──────────────────────────────────────────
  let parsed: AnthropicBody
  try {
    parsed = await request.json() as AnthropicBody
  } catch {
    return jsonError('요청 본문 파싱 실패', 400, origin, 'parse_error')
  }

  // 모델 화이트리스트는 공유 키 모드에서만 적용
  if (!isByok && !ALLOWED_MODELS.includes(parsed.model)) {
    return jsonError(`허용되지 않은 모델: ${parsed.model}`, 400, origin, 'invalid_model')
  }

  if (typeof parsed.max_tokens !== 'number' || parsed.max_tokens > MAX_TOKENS_LIMIT) {
    parsed.max_tokens = MAX_TOKENS_LIMIT
  }

  const rateLimitHeaders: Record<string, string> = isByok ? {} : {
    'X-RateLimit-Remaining': String(rateLimitRemaining),
    'X-RateLimit-Reset': nextMidnightUTC(),
    'X-RateLimit-Limit': String(dailyLimit),
  }

  // ── BYOK 라우팅 ────────────────────────────────────────────
  if (isByok) {
    if (provider === 'google') {
      const { url, googleBody } = transformToGoogle(parsed, userApiKey!)

      let googleRes: Response
      try {
        googleRes = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(googleBody),
        })
      } catch {
        return jsonError('Google API에 연결할 수 없습니다.', 503, origin, 'network_error')
      }

      const responseText = await googleRes.text()
      if (!googleRes.ok) return classifyByokError(googleRes.status, origin, 'Google')

      let googleData: Record<string, unknown>
      try { googleData = JSON.parse(responseText) as Record<string, unknown> } catch {
        return jsonError('Google API 응답 파싱 실패', 502, origin, 'unknown')
      }

      return jsonResponse(normalizeGoogleResponse(googleData, parsed.model), 200, origin)
    }

    if (provider === 'openai') {
      let openaiRes: Response
      try {
        openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userApiKey}`,
          },
          body: JSON.stringify(transformToOpenAI(parsed)),
        })
      } catch {
        return jsonError('OpenAI API에 연결할 수 없습니다.', 503, origin, 'network_error')
      }

      const responseText = await openaiRes.text()
      if (!openaiRes.ok) return classifyByokError(openaiRes.status, origin, 'OpenAI')

      let openaiData: Record<string, unknown>
      try { openaiData = JSON.parse(responseText) as Record<string, unknown> } catch {
        return jsonError('OpenAI API 응답 파싱 실패', 502, origin, 'unknown')
      }

      return jsonResponse(normalizeOpenAIResponse(openaiData, parsed.model), 200, origin)
    }

    // BYOK Anthropic — 직접 전달
    let anthropicRes: Response
    try {
      anthropicRes = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': userApiKey!,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify(parsed),
      })
    } catch {
      return jsonError('Anthropic API에 연결할 수 없습니다.', 503, origin, 'network_error')
    }

    const responseText = await anthropicRes.text()
    if (!anthropicRes.ok) return classifyByokError(anthropicRes.status, origin, 'Anthropic')

    return new Response(responseText, {
      status: anthropicRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }

  // ── 공유 키 모드: Anthropic 프록시 (지수 백오프 재시도) ─────
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    return jsonError('서버 설정 오류: API 키가 구성되지 않았습니다.', 500, origin, 'config_error')
  }

  const requestBody = JSON.stringify(parsed)
  let claudeResponse: Response = undefined!
  let responseBody = ''
  let lastRequestId = ''

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    claudeResponse = await fetch(ANTHROPIC_API_URL, {
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
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin), ...rateLimitHeaders },
  })
}
