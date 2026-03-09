// src/core/smart-paste.ts
//
// Tier 1 — 정규식 기반 Smart Paste 파서 (오프라인, $0)
// - detectCardType: 텍스트에서 카드 타입(server/db/api) 자동 감지
// - localSmartParse: 정형 텍스트를 필드로 파싱
// - generateTitle: 파싱된 필드에서 자동 제목 생성
// - 커버리지: SSH config, user@host, DB URI, JDBC, ADO.NET, MongoDB,
//             curl, URL+헤더, .env, 한글/영문 라벨

import type { ItemType } from './db'

// ─── 타입 ────────────────────────────────────────────────────

export interface ParsedField {
  key: string
  value: string
  confidence: 'high' | 'medium' | 'low'
}

export interface LocalParseResult {
  detectedType: ItemType | null
  fields: ParsedField[]
  hasStructuredMatch: boolean  // Tier 1으로 처리 가능했는지
}

// ─── 타입 감지 ───────────────────────────────────────────────

export function detectCardType(text: string): ItemType | null {
  // DB — URI 스킴
  if (/\b(postgres|mysql|mariadb|mongodb|redis|mssql):\/\//i.test(text)) return 'db'
  // DB — JDBC
  if (/jdbc:\w+:\/\//i.test(text)) return 'db'
  // DB — Key=Value (ADO.NET, 연결 문자열)
  if (/\b(Database|Initial Catalog|dbname)\s*=/i.test(text)) return 'db'

  // API — curl 명령
  if (/\bcurl\s+/i.test(text)) return 'api'
  // API — URL + 키워드
  if (/https?:\/\/.*\b(api|endpoint|webhook)\b/i.test(text)) return 'api'
  // API — 인증 키
  if (/\b(api[_-]?key|bearer|authorization)\s*[:=]/i.test(text)) return 'api'

  // Server — SSH config 블록
  if (/^\s*Host\s+\S+/m.test(text)) return 'server'
  // Server — user@host 패턴
  if (/\w+@[\w.-]+(?::\d+)?/.test(text)) return 'server'
  // Server — ssh 명령
  if (/\bssh\s+/i.test(text)) return 'server'

  // 한글 라벨 기반 감지
  if (/(?:호스트|서버|host|ip)\s*[:：=]/i.test(text)) {
    if (/(?:데이터베이스|DB명?|database)\s*[:：=]/i.test(text)) return 'db'
    return 'server'
  }

  return null
}

// ─── 메인 파서 ───────────────────────────────────────────────

export function localSmartParse(text: string, type: ItemType): LocalParseResult {
  const fields: ParsedField[] = []
  let hasStructuredMatch = false

  switch (type) {
    case 'server': hasStructuredMatch = parseServer(text, fields); break
    case 'db':     hasStructuredMatch = parseDB(text, fields); break
    case 'api':    hasStructuredMatch = parseAPI(text, fields); break
    case 'markdown':
      fields.push({ key: 'content', value: text.trim(), confidence: 'high' })
      hasStructuredMatch = true
      break
    case 'document':
      break
    default: {
      const _exhaustive: never = type
      throw new Error(`Unhandled type: ${_exhaustive}`)
    }
  }

  return { detectedType: type, fields, hasStructuredMatch }
}

// ─── 자동 제목 생성 ──────────────────────────────────────────

export function generateTitle(type: ItemType, fields: ParsedField[]): string {
  const get = (key: string) => fields.find(f => f.key === key)?.value ?? ''

  switch (type) {
    case 'server': {
      const host = get('host')
      const user = get('username')
      if (user && host) return `${user}@${host}`
      if (host) return host
      return 'New Server'
    }
    case 'db': {
      const dbName = get('dbName')
      const host = get('host')
      if (dbName && host) return `${dbName}@${host}`
      if (dbName) return dbName
      if (host) return host
      return 'New DB'
    }
    case 'api': {
      const url = get('url')
      const method = get('method')
      if (url) {
        try {
          const parsed = new URL(url)
          const path = parsed.pathname === '/' ? '' : parsed.pathname
          const label = `${parsed.host}${path}`
          return method ? `${method} ${label}` : label
        } catch {
          // URL 파싱 실패 → 원본 사용 (길면 자름)
          const short = url.length > 50 ? url.slice(0, 47) + '...' : url
          return method ? `${method} ${short}` : short
        }
      }
      return 'New API'
    }
    case 'markdown': {
      const content = get('content')
      if (content) {
        const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim()
        return firstLine.length > 50 ? firstLine.slice(0, 47) + '...' : firstLine
      }
      return 'New Markdown'
    }
    case 'document':
      return 'New Document'
  }
}

// ─── Server 파서 ─────────────────────────────────────────────

function parseServer(text: string, fields: ParsedField[]): boolean {
  // SSH config 블록
  const hostName = text.match(/^\s*HostName\s+(\S+)/m)
  if (hostName) {
    fields.push({ key: 'host', value: hostName[1], confidence: 'high' })
    const m = (p: RegExp) => text.match(p)?.[1]
    const user = m(/^\s*User\s+(\S+)/m)
    if (user) fields.push({ key: 'username', value: user, confidence: 'high' })
    const port = m(/^\s*Port\s+(\d+)/m)
    if (port) fields.push({ key: 'port', value: port, confidence: 'high' })
    const identity = m(/^\s*IdentityFile\s+(.+)/m)
    if (identity) fields.push({ key: 'keyPath', value: identity.trim(), confidence: 'high' })
    return true
  }

  // user@host:port
  const ssh = text.match(/(\w[\w.-]*)@([\w.-]+)(?::(\d{1,5}))?/)
  if (ssh) {
    fields.push({ key: 'username', value: ssh[1], confidence: 'high' })
    fields.push({ key: 'host', value: ssh[2], confidence: 'high' })
    if (ssh[3]) fields.push({ key: 'port', value: ssh[3], confidence: 'high' })
    return true
  }

  // 한글/영문 라벨
  return parseLabeledFields(text, fields, [
    ['host', /(?:호스트|host|ip|서버)\s*[:：=]\s*(\S+)/i],
    ['port', /(?:포트|port)\s*[:：=]\s*(\d+)/i],
    ['username', /(?:계정|사용자|유저|아이디|user(?:name)?)\s*[:：=]\s*(\S+)/i],
    ['password', /(?:비밀번호|패스워드|비번|pass(?:word)?)\s*[:：=]\s*(\S+)/i],
  ])
}

// ─── DB 파서 ─────────────────────────────────────────────────

function parseDB(text: string, fields: ParsedField[]): boolean {
  // URI 형식 (postgres, mysql, mariadb, mongodb, redis, mssql)
  const uri = text.match(
    /(postgres(?:ql)?|mysql|mariadb|mongodb|redis|mssql):\/\/(?:([^:@]+)(?::([^@]+))?@)?([\w.-]+)(?::(\d+))?\/?(\w+)?/i
  )
  if (uri) {
    fields.push({ key: 'host', value: uri[4], confidence: 'high' })
    if (uri[5]) fields.push({ key: 'port', value: uri[5], confidence: 'high' })
    if (uri[6]) fields.push({ key: 'dbName', value: uri[6], confidence: 'high' })
    if (uri[2]) fields.push({ key: 'username', value: uri[2], confidence: 'high' })
    if (uri[3]) fields.push({ key: 'password', value: uri[3], confidence: 'high' })
    return true
  }

  // JDBC 형식
  const jdbc = text.match(
    /jdbc:(\w+):\/\/([\w.-]+)(?::(\d+))?(?:\/(\w+))?/i
  )
  if (jdbc) {
    fields.push({ key: 'host', value: jdbc[2], confidence: 'high' })
    if (jdbc[3]) fields.push({ key: 'port', value: jdbc[3], confidence: 'high' })
    if (jdbc[4]) fields.push({ key: 'dbName', value: jdbc[4], confidence: 'high' })
    return true
  }

  // Key=Value 형식 (ADO.NET, 연결 문자열 등)
  const kvParsed = parseLabeledFields(text, fields, [
    ['host', /(?:Host|Server|Data Source)\s*=\s*([^;\n]+)/i],
    ['port', /Port\s*=\s*(\d+)/i],
    ['dbName', /(?:Database|Initial Catalog|dbname)\s*=\s*([^;\n]+)/i],
    ['username', /(?:User(?:name)?|User Id|UID)\s*=\s*([^;\n]+)/i],
    ['password', /(?:Password|PWD)\s*=\s*([^;\n]+)/i],
  ])
  if (kvParsed) return true

  // 한글 라벨
  return parseLabeledFields(text, fields, [
    ['host', /(?:호스트|host|서버)\s*[:：=]\s*(\S+)/i],
    ['port', /(?:포트|port)\s*[:：=]\s*(\d+)/i],
    ['dbName', /(?:데이터베이스|DB명?|database)\s*[:：=]\s*(\S+)/i],
    ['username', /(?:계정|사용자|user(?:name)?)\s*[:：=]\s*(\S+)/i],
    ['password', /(?:비밀번호|패스워드|비번|pass(?:word)?)\s*[:：=]\s*(\S+)/i],
  ])
}

// ─── API 파서 ────────────────────────────────────────────────

function parseAPI(text: string, fields: ParsedField[]): boolean {
  let found = false

  // URL 추출
  const url = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i)
  if (url) {
    fields.push({ key: 'url', value: url[0], confidence: 'high' })
    found = true
  }

  // HTTP 메서드
  const method = text.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/)
  if (method) {
    fields.push({ key: 'method', value: method[1], confidence: 'medium' })
    found = true
  }

  // Bearer / Authorization 토큰
  const bearer = text.match(
    /(?:Bearer|Authorization)\s*[:=]?\s*["']?([A-Za-z0-9\-_.~+/=]{20,})["']?/i
  )
  if (bearer) {
    fields.push({ key: 'token', value: bearer[1], confidence: 'high' })
    found = true
  }

  // API Key
  const apiKey = text.match(
    /(?:api[_-]?key|x-api-key)\s*[:=]\s*["']?([^\s"']+)["']?/i
  )
  if (apiKey) {
    fields.push({ key: 'apiKey', value: apiKey[1], confidence: 'high' })
    found = true
  }

  // curl 헤더에서 추가 추출
  const headers = extractCurlHeaders(text)
  if (headers) {
    fields.push({ key: 'headers', value: headers, confidence: 'medium' })
    found = true
  }

  return found
}

// ─── curl 헤더 추출 ──────────────────────────────────────────

function extractCurlHeaders(text: string): string | null {
  const headerMatches = text.matchAll(/-H\s+["']([^"']+)["']/gi)
  const headers: string[] = []
  for (const m of headerMatches) {
    const header = m[1].trim()
    // Authorization / API Key는 이미 별도 파싱하므로 제외
    if (!/^(Authorization|x-api-key)/i.test(header)) {
      headers.push(header)
    }
  }
  return headers.length > 0 ? headers.join('\n') : null
}

// ─── Document용 패턴 감지 (Tier 1 힌트) ─────────────────────

export interface PatternHint {
  type: 'credential' | 'url' | 'env' | 'code'
  snippet: string        // 매칭된 원본 텍스트 조각
  confidence: 'high' | 'medium'
}

/** 텍스트에서 섹션 후보 패턴을 감지한다 (document Smart Paste용 Tier 1) */
export function detectPatterns(text: string): PatternHint[] {
  const hints: PatternHint[] = []

  // Credential 패턴: user@host, SSH config, 호스트:포트
  if (/\w+@[\w.-]+/.test(text) || /^\s*Host(?:Name)?\s+\S+/m.test(text)) {
    hints.push({ type: 'credential', snippet: 'SSH/서버 접속 정보 감지', confidence: 'high' })
  }
  if (/(?:호스트|host|ip|서버)\s*[:：=]\s*\S+/i.test(text) && /(?:비밀번호|password|pass)\s*[:：=]/i.test(text)) {
    hints.push({ type: 'credential', snippet: '라벨 기반 접속 정보 감지', confidence: 'high' })
  }

  // URL 패턴
  const urlMatches = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi)
  if (urlMatches && urlMatches.length > 0) {
    hints.push({ type: 'url', snippet: `URL ${urlMatches.length}개 감지`, confidence: 'high' })
  }

  // ENV 패턴: KEY=VALUE (대문자로 시작, 여러 줄)
  const envLines = text.match(/^[A-Z][A-Z0-9_]+=.+$/gm)
  if (envLines && envLines.length >= 2) {
    hints.push({ type: 'env', snippet: `환경변수 ${envLines.length}개 감지`, confidence: 'high' })
  }

  // 코드 블록 패턴: ``` 또는 들여쓰기 블록
  if (/```[\s\S]*?```/.test(text)) {
    hints.push({ type: 'code', snippet: '코드 블록 감지', confidence: 'high' })
  } else if (/^\s{4,}\S/m.test(text) && text.split('\n').filter(l => /^\s{4,}\S/.test(l)).length >= 3) {
    hints.push({ type: 'code', snippet: '들여쓰기 코드 감지', confidence: 'medium' })
  }

  return hints
}

/** Tier 1 문서 파서: 패턴 힌트 기반으로 기본 섹션 구조를 생성 */
export function localDocumentParse(text: string, hints: PatternHint[]): {
  title: string
  sections: Array<{ type: 'markdown' | 'credentials' | 'urls' | 'env' | 'code'; content: string }>
} {
  // 힌트가 없으면 전체를 markdown으로
  if (hints.length === 0) {
    const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim()
    return {
      title: firstLine.length > 30 ? firstLine.slice(0, 27) + '...' : firstLine || 'New Document',
      sections: [{ type: 'markdown', content: text }],
    }
  }

  const sections: Array<{ type: 'markdown' | 'credentials' | 'urls' | 'env' | 'code'; content: string }> = []
  let remaining = text

  // ENV 추출
  if (hints.some(h => h.type === 'env')) {
    const envLines = remaining.match(/^[A-Z][A-Z0-9_]+=.+$/gm)
    if (envLines) {
      sections.push({ type: 'env', content: envLines.join('\n') })
      for (const line of envLines) {
        remaining = remaining.replace(line, '')
      }
    }
  }

  // URL 추출
  if (hints.some(h => h.type === 'url')) {
    const urls = remaining.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi)
    if (urls) {
      sections.push({ type: 'urls', content: urls.join('\n') })
    }
  }

  // 코드 블록 추출
  if (hints.some(h => h.type === 'code')) {
    const codeBlocks = remaining.match(/```[\s\S]*?```/g)
    if (codeBlocks) {
      for (const block of codeBlocks) {
        const clean = block.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
        sections.push({ type: 'code', content: clean })
        remaining = remaining.replace(block, '')
      }
    }
  }

  // 나머지를 markdown으로
  const cleaned = remaining.trim()
  if (cleaned) {
    sections.unshift({ type: 'markdown', content: cleaned })
  }

  const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim()
  return {
    title: firstLine.length > 30 ? firstLine.slice(0, 27) + '...' : firstLine || 'New Document',
    sections,
  }
}

// ─── 라벨 매칭 공통 ─────────────────────────────────────────

function parseLabeledFields(
  text: string,
  fields: ParsedField[],
  patterns: [string, RegExp][]
): boolean {
  let found = false
  for (const [key, pattern] of patterns) {
    // 이미 파싱된 키는 건너뜀
    if (fields.some(f => f.key === key)) continue
    const match = text.match(pattern)
    if (match) {
      fields.push({ key, value: match[1].trim(), confidence: 'high' })
      found = true
    }
  }
  return found
}
