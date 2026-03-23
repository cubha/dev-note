// src/core/ai.ts
//
// Claude API fetch 래퍼 (Vercel Edge Function 공유 키 체제)
// - Vercel Edge Function 프록시를 통해 호출 (API 키 클라이언트 미보유)
// - Structured Outputs: output_config.format.json_schema로 100% 유효 JSON 보장
// - 호출 간격 제한 (500ms 쿨다운)
// - SDK 불필요 — fetch 직접 호출로 번들 크기 0 추가

import type { ItemType } from './db'
import { SMART_PASTE_SCHEMA, SUMMARY_SCHEMA, DOCUMENT_PASTE_SCHEMA, MARKDOWN_PASTE_SCHEMA } from './ai-schemas'

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

export interface MarkdownPasteResult {
  title: string
  content: string
  suggestedTags: string[]
  confidence: 'high' | 'medium' | 'low'
}

export interface SummaryResult {
  summary: string
  keyPoints: string[]
}

interface ClaudeContentBlock {
  type: string
  text?: string
  input?: Record<string, unknown>
}

interface ClaudeResponse {
  content: ClaudeContentBlock[]
  model: string
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}

// ─── 에러 코드 ──────────────────────────────────────────────

export type AIErrorCode =
  | 'auth_error'
  | 'permission_error'
  | 'credit_exhausted'
  | 'daily_limit_exceeded'
  | 'anthropic_rate_limit'
  | 'overloaded'
  | 'input_too_long'
  | 'invalid_request'
  | 'invalid_model'
  | 'parse_error'
  | 'network_error'
  | 'unknown'

// ─── 에러 클래스 ─────────────────────────────────────────────

export class AIError extends Error {
  code: AIErrorCode
  httpStatus: number

  constructor(message: string, code: AIErrorCode = 'unknown', httpStatus = 0) {
    super(message)
    this.name = 'AIError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

export class RateLimitError extends AIError {
  retryAfter: number
  constructor(message: string, code: AIErrorCode, retryAfter: number) {
    super(message, code, 429)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

// ─── 에러 리포트 ─────────────────────────────────────────────

export interface ErrorReportData {
  code: AIErrorCode
  status: number
  message: string
  model?: string
  cardType?: string
  timestamp: string
  userMessage?: string
}

export async function reportError(workerUrl: string, data: ErrorReportData): Promise<boolean> {
  try {
    const res = await fetch(`${workerUrl}/v1/error-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── AI Service ──────────────────────────────────────────────

// smartPaste/summarize: 정형 추출 → 속도·비용 우선
const FAST_MODEL = 'claude-haiku-4-5-20251001'
// documentSmartPaste: 복잡한 섹션 분류·구조화 → 품질 우선
const QUALITY_MODEL = 'claude-sonnet-4-6'
const MIN_INTERVAL_MS = 500

export class AIService {
  private workerUrl: string
  private lastCallTime = 0

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl
  }

  /** Smart Paste — 비정형 텍스트에서 구조화 데이터 추출 */
  async smartPaste(text: string, targetType?: ItemType): Promise<SmartPasteResult> {
    await this.enforceRateLimit()

    const response = await this.callClaude({
      model: FAST_MODEL,
      max_tokens: 1024,
      system: buildSmartPastePrompt(targetType),
      messages: [{ role: 'user', content: text }],
      tools: [{ name: 'extract_card_data', description: 'Extract structured card data from text', input_schema: SMART_PASTE_SCHEMA }],
      tool_choice: { type: 'tool', name: 'extract_card_data' },
    })

    const toolBlock = response.content.find((b: ClaudeContentBlock) => b.type === 'tool_use')
    if (!toolBlock?.input) {
      throw new AIError('Claude 응답에 구조화 데이터가 없습니다.')
    }

    return toolBlock.input as unknown as SmartPasteResult
  }

  /** 카드 콘텐츠 요약 (한글) */
  async summarize(text: string, cardType: ItemType): Promise<SummaryResult> {
    await this.enforceRateLimit()

    const response = await this.callClaude({
      model: FAST_MODEL,
      max_tokens: 1024,
      system: buildSummaryPrompt(cardType),
      messages: [{ role: 'user', content: text }],
      tools: [{ name: 'summarize_content', description: 'Summarize card content in Korean', input_schema: SUMMARY_SCHEMA }],
      tool_choice: { type: 'tool', name: 'summarize_content' },
    })

    const toolBlock = response.content.find((b: ClaudeContentBlock) => b.type === 'tool_use')
    if (!toolBlock?.input) {
      throw new AIError('Claude 응답에 구조화 데이터가 없습니다.')
    }

    return toolBlock.input as unknown as SummaryResult
  }

  /** Markdown Smart Paste — 자유 텍스트 → 정돈된 마크다운 변환 */
  async markdownSmartPaste(text: string): Promise<MarkdownPasteResult> {
    await this.enforceRateLimit()

    const response = await this.callClaude({
      model: FAST_MODEL,
      max_tokens: 4096,
      system: buildMarkdownPastePrompt(),
      messages: [{ role: 'user', content: text }],
      tools: [{ name: 'convert_to_markdown', description: 'Convert free-form text to structured markdown', input_schema: MARKDOWN_PASTE_SCHEMA }],
      tool_choice: { type: 'tool', name: 'convert_to_markdown' },
    })

    const toolBlock = response.content.find((b: ClaudeContentBlock) => b.type === 'tool_use')
    if (!toolBlock?.input) {
      throw new AIError('Claude 응답에 구조화 데이터가 없습니다.')
    }

    return toolBlock.input as unknown as MarkdownPasteResult
  }

  /** Document Smart Paste — 자유형 텍스트 → 섹션 구조화 (Sonnet: 복잡한 멀티섹션 분류) */
  async documentSmartPaste(text: string): Promise<DocumentPasteResult> {
    await this.enforceRateLimit()

    const response = await this.callClaude({
      model: QUALITY_MODEL,
      max_tokens: 4096,
      system: buildDocumentPastePrompt(),
      messages: [{ role: 'user', content: text }],
      tools: [{ name: 'structure_document', description: 'Structure free-form text into document sections', input_schema: DOCUMENT_PASTE_SCHEMA }],
      tool_choice: { type: 'tool', name: 'structure_document' },
    })

    const toolBlock = response.content.find((b: ClaudeContentBlock) => b.type === 'tool_use')
    if (!toolBlock?.input) {
      throw new AIError('Claude 응답에 구조화 데이터가 없습니다.')
    }

    return toolBlock.input as unknown as DocumentPasteResult
  }

  private async callClaude(body: Record<string, unknown>): Promise<ClaudeResponse> {
    const url = `${this.workerUrl}/v1/messages`

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new AIError(
        'Worker 서버에 연결할 수 없습니다. 네트워크를 확인해주세요.',
        'network_error',
      )
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '')
      let code: AIErrorCode = 'unknown'
      let message = `Claude API 오류 (${res.status})`

      try {
        const parsed = JSON.parse(errorBody) as { error?: string; code?: string }
        if (parsed.code) code = parsed.code as AIErrorCode
        if (parsed.error) message = parsed.error
      } catch {
        message = errorBody.slice(0, 200) || message
      }

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10)
        throw new RateLimitError(message, code, retryAfter)
      }

      throw new AIError(message, code, res.status)
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

const buildSummaryPrompt = (cardType: ItemType): string => {
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

const buildDocumentPastePrompt = (): string => {
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
- Mark passwords and secrets appropriately (secret: true for env, include in password field for credentials)`
}

const buildMarkdownPastePrompt = (): string => {
  return `You are a content organizer that converts free-form text into well-structured Markdown.

Your job:
1. Analyze the user's raw text (notes, meeting minutes, brainstorms, research, etc.)
2. Organize it into clean, readable Markdown

Formatting rules:
- Add appropriate headings (## or ###) to separate logical sections
- Convert tabular/comparative data into Markdown tables (| col1 | col2 |)
- Normalize list formats (bullets → -, numbered → 1. 2. 3.)
- Wrap code snippets in fenced code blocks (\`\`\`lang)
- Convert bare URLs into [label](url) links
- Bold key terms or labels where it improves readability
- Preserve ALL original information — do not omit, summarize, or fabricate
- If the input is already well-formatted Markdown, keep it as-is with minimal cleanup

Title rules:
- Generate a concise title (under 30 chars) that captures the main topic
- Korean preferred if the input is Korean

Tag rules:
- Suggest 1-5 relevant tags based on the content's topic/domain
- Use lowercase, short keywords (e.g., "devops", "회의록", "api", "설정")`
}

const buildSmartPastePrompt = (targetType?: ItemType): string => {
  return `You are a structured data extraction assistant for a developer's tool.
Extract server, database, or API connection information from the given text.

Field mappings by type:
- server: host, port(default 22), username, password, keyPath, note
- db: host, port(default 3306/5432), dbName, username, password, note
- api: url, method(default GET), apiKey, token, headers, note
- markdown: content

Rules:
- Extract ONLY information explicitly present in the text
- Use empty string "" for fields not mentioned (do not guess)
- Preserve exact values without modification
- Generate a concise title (under 20 chars) describing the resource
- Suggest relevant tags (production, staging, mysql, ssh, etc.)
${targetType ? `- Target type is "${targetType}"` : '- Auto-detect the most appropriate type'}`
}
