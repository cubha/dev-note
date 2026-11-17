/**
 * POST /v1/messages — LLM 멀티 프로바이더 프록시
 *
 * Vercel Edge Function — BYOK 전용 (서버 보관 키 없음)
 * - X-User-Api-Key 헤더 필수. 없으면 401 api_key_required (서버 키로 폴백하지 않는다)
 * - X-Provider 헤더로 라우팅
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

// ── 유틸 ─────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-User-Api-Key, X-Provider',
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

// ── 사용량 집계 계측 (대시보드용 메타데이터) ────────────────
// 노트 평문·제목은 절대 기록하지 않는다. 호출 수·모델 분포·실패 수만 집계.
const METRIC_RETENTION = 7_776_000 // 90일 (일별 키 보존)

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// 누적 키는 영구, 일별 키는 EXPIRE 부여. fire-and-forget이 아니라 await로 호출해
// Edge 종료 전에 반영되게 한다(계측 실패는 핵심 경로에 영향 없음).
async function recordMetrics(totalKeys: string[], dailyKeys: string[]): Promise<void> {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) return
  const cmds: Array<Array<string | number>> = totalKeys.map((k) => ['INCR', k])
  for (const k of dailyKeys) {
    cmds.push(['INCR', k])
    cmds.push(['EXPIRE', k, METRIC_RETENTION])
  }
  try {
    await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    })
  } catch {
    // 계측 실패 무시
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

// D2: 총계/일별과 함께 code별 카운터도 기록 — /v1/metrics가 KEYS m:fail:code:*로 열거해
// 대시보드 실패 사유 버킷(core/errorBuckets.ts)의 원자재가 된다.
async function recordFail(code: string): Promise<void> {
  await recordMetrics(['m:fail:total', `m:fail:code:${code}`], [`m:fail:${todayStr()}`])
}

async function classifyByokError(status: number, origin: string, providerName: string): Promise<Response> {
  if (status === 401 || status === 403) {
    await recordFail('byok_auth_error')
    return jsonError('입력한 API 키가 올바르지 않습니다.', 401, origin, 'byok_auth_error')
  }
  if (status === 429) {
    await recordFail('byok_quota_exceeded')
    return jsonError('입력한 키의 사용량 한도를 초과했습니다.', 429, origin, 'byok_quota_exceeded')
  }
  await recordFail('unknown')
  return jsonError(`${providerName} API 오류 (${status})`, status, origin, 'unknown')
}

interface AnthropicError {
  error?: { type?: string; message?: string }
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

  // ── BYOK 필수 ──────────────────────────────────────────────
  // 서버 보관 키 경로는 제거됐다. 키가 없으면 rate limit·집계보다 먼저 거부한다
  // (거부 요청이 m:calls 집계를 부풀리지 않도록).
  const userApiKey = request.headers.get('X-User-Api-Key')?.trim() ?? ''
  const provider = (request.headers.get('X-Provider') ?? 'anthropic') as 'anthropic' | 'google' | 'openai'
  if (!userApiKey) {
    return jsonError('API 키가 필요합니다. 설정 → AI에서 본인 API 키를 입력해주세요.', 401, origin, 'api_key_required')
  }

  // ── 요청 본문 파싱 ──────────────────────────────────────────
  let parsed: AnthropicBody
  try {
    parsed = await request.json() as AnthropicBody
  } catch {
    return jsonError('요청 본문 파싱 실패', 400, origin, 'parse_error')
  }

  if (typeof parsed.max_tokens !== 'number' || parsed.max_tokens > MAX_TOKENS_LIMIT) {
    parsed.max_tokens = MAX_TOKENS_LIMIT
  }

  // 사용량 집계: 수락된 호출 수·모델 분포·일별 (실패는 classify*Error에서 별도 카운트)
  // 모델 키는 화이트리스트로 버킷팅 — BYOK 임의 모델명으로 m:model:* 키가 무한 생성되는
  // 가용성/비용 벡터 차단(미허용 모델은 'other'로 합산).
  const modelLabel = ALLOWED_MODELS.includes(parsed.model) ? parsed.model : 'other'
  await recordMetrics(
    ['m:calls:total', `m:model:${modelLabel}`],
    [`m:calls:${todayStr()}`],
  )

  // ── 프로바이더 라우팅 ──────────────────────────────────────
  if (provider === 'google') {
    const { url, googleBody } = transformToGoogle(parsed, userApiKey)

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
        'x-api-key': userApiKey,
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
