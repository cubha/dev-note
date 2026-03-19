// src/core/ai.ts
//
// Tier 2 — Claude API fetch 래퍼 (BYOK, 서버 없음)
// - 브라우저 직접 호출: anthropic-dangerous-direct-browser-access 헤더
// - Structured Outputs: output_config.format.json_schema로 100% 유효 JSON 보장
// - 호출 간격 제한 (500ms 쿨다운)
// - SDK 불필요 — fetch 직접 호출로 번들 크기 0 추가

import type { ItemType } from './db'
import { SMART_PASTE_SCHEMA, SUMMARY_SCHEMA, DOCUMENT_PASTE_SCHEMA } from './ai-schemas'
import type { PatternHint } from './smart-paste'

// ─── 타입 ────────────────────────────────────────────────────

export interface SmartPasteResult {
  detectedType: ItemType
  title: string
  fields: Array<{ key: string; value: string }>
  suggestedTags: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface DocumentPasteResult {
  title: string
  suggestedTags: string[]
  sections: Array<{
    type: 'markdown' | 'credentials' | 'urls' | 'env' | 'code'
    title: string
    content: string  // JSON string — 타입별 구조화 데이터
  }>
  confidence: 'high' | 'medium' | 'low'
}

export interface SummaryResult {
  summary: string
  keyPoints: string[]
}

interface ClaudeContentBlock {
  type: string
  text?: string
}

interface ClaudeResponse {
  content: ClaudeContentBlock[]
  model: string
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}

// ─── 에러 클래스 ─────────────────────────────────────────────

export class AIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AIError'
  }
}

export class RateLimitError extends AIError {
  retryAfter: number
  constructor(retryAfter: number) {
    super(`Rate limit 초과. ${retryAfter}초 후 재시도하세요.`)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

// ─── AI Service ──────────────────────────────────────────────

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
// smartPaste/summarize: 정형 추출 → 속도·비용 우선
const FAST_MODEL = 'claude-haiku-4-5-20251001'
// documentSmartPaste: 복잡한 섹션 분류·구조화 → 품질 우선
const QUALITY_MODEL = 'claude-sonnet-4-6'
const MIN_INTERVAL_MS = 500

export class AIService {
  /** BYOK 키 or null (공유 Worker 모드) */
  private apiKey: string | null
  /** 공유 Worker URL (null = BYOK 직접 호출) */
  private workerUrl: string | null
  private lastCallTime = 0

  constructor(apiKey: string | null, workerUrl?: string) {
    this.apiKey = apiKey
    this.workerUrl = workerUrl ?? null
  }

  /** Smart Paste — 비정형 텍스트에서 구조화 데이터 추출 */
  async smartPaste(text: string, targetType?: ItemType): Promise<SmartPasteResult> {
    await this.enforceRateLimit()

    const systemPrompt = buildSmartPastePrompt(targetType)
    const response = await this.callClaude({
      model: FAST_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
      output_config: {
        format: { type: 'json_schema', schema: SMART_PASTE_SCHEMA },
      },
    })

    const textBlock = response.content.find(
      (b: ClaudeContentBlock) => b.type === 'text',
    )
    if (!textBlock?.text) {
      throw new AIError('Claude 응답에 텍스트가 없습니다.')
    }

    return JSON.parse(textBlock.text) as SmartPasteResult
  }

  /** 카드 콘텐츠 요약 (한글) */
  async summarize(text: string, cardType: ItemType): Promise<SummaryResult> {
    await this.enforceRateLimit()

    const response = await this.callClaude({
      model: FAST_MODEL,
      max_tokens: 512,
      system: buildSummaryPrompt(cardType),
      messages: [{ role: 'user', content: text }],
      output_config: {
        format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
      },
    })

    const textBlock = response.content.find(
      (b: ClaudeContentBlock) => b.type === 'text',
    )
    if (!textBlock?.text) {
      throw new AIError('Claude 응답에 텍스트가 없습니다.')
    }

    return JSON.parse(textBlock.text) as SummaryResult
  }

  /** Document Smart Paste — 자유형 텍스트 → 섹션 구조화 (Sonnet: 복잡한 멀티섹션 분류) */
  async documentSmartPaste(text: string, hints: PatternHint[]): Promise<DocumentPasteResult> {
    await this.enforceRateLimit()

    const response = await this.callClaude({
      model: QUALITY_MODEL,
      max_tokens: 2048,
      system: buildDocumentPastePrompt(hints),
      messages: [{ role: 'user', content: text }],
      output_config: {
        format: { type: 'json_schema', schema: DOCUMENT_PASTE_SCHEMA },
      },
    })

    const textBlock = response.content.find(
      (b: ClaudeContentBlock) => b.type === 'text',
    )
    if (!textBlock?.text) {
      throw new AIError('Claude 응답에 텍스트가 없습니다.')
    }

    return JSON.parse(textBlock.text) as DocumentPasteResult
  }

  /** API 키 유효성 빠른 검증 (저비용 호출) */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.callClaude({
        model: FAST_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return true
    } catch (err) {
      if (err instanceof AIError && err.message.includes('유효하지 않')) {
        return false
      }
      throw err
    }
  }

  private async callClaude(body: Record<string, unknown>): Promise<ClaudeResponse> {
    // Worker 모드: 공유 키, API 키 헤더 불필요
    const isWorkerMode = !!this.workerUrl && !this.apiKey
    const url = isWorkerMode
      ? `${this.workerUrl}/v1/messages`
      : CLAUDE_API_URL

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (!isWorkerMode && this.apiKey) {
      headers['x-api-key'] = this.apiKey
      headers['anthropic-version'] = ANTHROPIC_VERSION
      headers['anthropic-dangerous-direct-browser-access'] = 'true'
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10)
      throw new RateLimitError(retryAfter)
    }
    if (res.status === 401) {
      throw new AIError('API 키가 유효하지 않습니다. 설정에서 확인해주세요.')
    }
    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      throw new AIError(`Claude API 오류 (${res.status}): ${errorBody.slice(0, 200)}`)
    }

    return res.json() as Promise<ClaudeResponse>
  }

  private async enforceRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastCallTime
    if (elapsed < MIN_INTERVAL_MS) {
      await new Promise(r => setTimeout(r, MIN_INTERVAL_MS - elapsed))
    }
    this.lastCallTime = Date.now()
  }
}

// ─── 시스템 프롬프트 빌더 ────────────────────────────────────

function buildSummaryPrompt(cardType: ItemType): string {
  return `You are a concise summarizer for a developer's information card.
The card type is "${cardType}".

Rules:
- Write the summary in Korean (한글)
- Provide 2-3 sentence summary
- List up to 5 key points as short bullet items
- For server/db cards: focus on connection details, access restrictions
- For api cards: focus on endpoint purpose, authentication method
- For note/custom cards: focus on main topic and key takeaways
- Do not include sensitive data (passwords, tokens) in the summary`
}

function buildDocumentPastePrompt(hints: PatternHint[]): string {
  const hintLines = hints.length > 0
    ? `\nDetected patterns (Tier 1 hints):\n${hints.map(h => `- ${h.type}: ${h.snippet} (${h.confidence})`).join('\n')}`
    : ''

  return `You are a document structuring assistant for a developer's tool.
Convert free-form text into structured sections for a "Document" card.

Available section types:
- markdown: General text/notes. content = plain text.
- credentials: Server/DB connection info. content = JSON array of objects with fields: label, category("server"|"database"|"other"), host, port, username, password, database(optional), extra.
- urls: URL collection. content = JSON array of objects with fields: label, url, method(optional), note.
- env: Environment variables. content = JSON array of objects with fields: key, value, secret(boolean).
- code: Code snippets. content = JSON string (the raw code). Also include language detection in the title (e.g., "SQL Script" or "Bash").

Rules:
- Analyze the input text and split into logical sections
- Each section's "content" field must be a JSON string (use JSON.stringify for arrays/objects, or plain string for markdown/code)
- For markdown sections: content is the plain text
- For code sections: content is the raw code string
- For other types: content is a JSON-serialized array
- Generate a concise document title (under 30 chars, Korean preferred if input is Korean)
- Suggest relevant tags
- Preserve all data exactly as provided — do not guess or fabricate values
- Mark passwords and secrets appropriately (secret: true for env, include in password field for credentials)${hintLines}`
}

function buildSmartPastePrompt(targetType?: ItemType): string {
  return `You are a structured data extraction assistant for a developer's tool.
Extract server, database, or API connection information from the given text.

Field mappings by type:
- server: host, port(default 22), username, password, keyPath, note
- db: host, port(default 3306/5432), dbName, username, password, note
- api: url, method(default GET), apiKey, token, headers, note
- note/custom: content

Rules:
- Extract ONLY information explicitly present in the text
- Use empty string "" for fields not mentioned (do not guess)
- Preserve exact values without modification
- Generate a concise title (under 20 chars) describing the resource
- Suggest relevant tags (production, staging, mysql, ssh, etc.)
${targetType ? `- Target type is "${targetType}"` : '- Auto-detect the most appropriate type'}`
}
