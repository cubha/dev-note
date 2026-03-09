import type { ItemType } from './db'

// ─── 구조화 콘텐츠 타입 ─────────────────────────────────

/** 카드 필드의 값 타입 */
export type FieldType = 'text' | 'password' | 'url' | 'email' | 'number' | 'multiline'

/** 카드의 개별 필드 */
export interface CardField {
  key: string        // 고유 필드 키 (예: 'host', 'port', 'password')
  label: string      // 표시 라벨 (예: 'Host', 'Port', '비밀번호')
  value: string      // 필드 값
  type: FieldType    // 렌더링/동작 결정 (password → 마스킹, url → 링크 등)
}

/** 구조화된 카드 콘텐츠 (content 필드의 JSON) */
export interface StructuredContent {
  format: 'structured'
  fields: CardField[]
}

/** 레거시 텍스트 콘텐츠 (이전 버전 호환) */
export interface LegacyContent {
  format: 'legacy'
  text: string
}

// ─── 하이브리드 콘텐츠 (document 타입 전용) ─────────────

/** 섹션 타입 */
export type SectionType = 'markdown' | 'credentials' | 'urls' | 'env' | 'code'

/** 섹션 기본 인터페이스 */
interface SectionBase {
  id: string              // nanoid(12)
  type: SectionType
  title: string           // 섹션 제목 (빈 문자열 허용)
  collapsed: boolean      // 접힘/펼침 상태
}

/** 마크다운 텍스트 섹션 */
export interface MarkdownSection extends SectionBase {
  type: 'markdown'
  text: string
}

/** 접속 정보 항목 */
export interface CredentialEntry {
  id: string              // nanoid(8)
  label: string           // "운영서버", "개발 DB" 등
  category: 'server' | 'database' | 'other'
  host: string
  port: string
  username: string
  password: string
  database?: string       // DB 전용
  extra: string           // 비고/메모
}

/** 접속 정보 섹션 */
export interface CredentialSection extends SectionBase {
  type: 'credentials'
  items: CredentialEntry[]
}

/** URL 항목에 첨부할 메모카드 */
export interface UrlNoteCard {
  id: string              // nanoid(8)
  title: string           // 메모 제목 (빈 문자열 허용)
  text: string            // 메모 내용
}

/** URL 항목 */
export interface UrlEntry {
  id: string
  label: string           // "관리자 페이지", "API 문서" 등
  url: string
  method?: string         // API 전용 (GET/POST 등)
  note: string
  noteCards?: UrlNoteCard[]  // 항목별 메모카드 목록
}

/** URL 모음 섹션 */
export interface UrlSection extends SectionBase {
  type: 'urls'
  items: UrlEntry[]
}

/** 환경변수 항목 */
export interface EnvEntry {
  id: string              // nanoid(8) — 안정적 key prop
  key: string
  value: string
  secret: boolean         // true → 마스킹 렌더링
}

/** 환경변수 / Key-Value 섹션 */
export interface EnvSection extends SectionBase {
  type: 'env'
  pairs: EnvEntry[]
}

/** 코드 스니펫 섹션 */
export interface CodeSection extends SectionBase {
  type: 'code'
  language: string        // 'bash', 'sql', 'json' 등
  code: string
}

/** 모든 섹션 유니온 */
export type AnySection = MarkdownSection | CredentialSection | UrlSection | EnvSection | CodeSection

/** 하이브리드 콘텐츠 — document 타입 전용 */
export interface HybridContent {
  format: 'hybrid'
  sections: AnySection[]
}

/** 통합 콘텐츠 타입 */
export type CardContent = StructuredContent | LegacyContent | HybridContent

// ─── 타입별 기본 필드 스키마 ─────────────────────────────

export interface FieldSchema {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  options?: string[]    // 드롭다운 선택지 (예: API method)
}

/** 아이템 타입별 기본 필드 구성 (document 타입은 HybridContent 사용으로 빈 배열) */
export const FIELD_SCHEMAS: Record<ItemType, FieldSchema[]> = {
  server: [
    { key: 'host', label: 'Host / IP', type: 'text', placeholder: '10.0.0.1 또는 example.com' },
    { key: 'port', label: 'Port', type: 'number', placeholder: '22' },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'admin' },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    { key: 'keyPath', label: 'Key / PEM', type: 'multiline', placeholder: '~/.ssh/id_rsa 또는 키 내용 붙여넣기' },
    { key: 'note', label: '비고', type: 'multiline', placeholder: 'VPN 필요, 접속 시 주의사항 등' },
  ],
  db: [
    { key: 'host', label: 'Host', type: 'text', placeholder: '10.0.0.1' },
    { key: 'port', label: 'Port', type: 'number', placeholder: '3306' },
    { key: 'dbName', label: 'Database', type: 'text', placeholder: 'prod_main' },
    { key: 'username', label: 'Username', type: 'text', placeholder: 'dbadmin' },
    { key: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
    { key: 'note', label: '비고', type: 'multiline', placeholder: '읽기 전용, 슬로우 쿼리 주의 등' },
  ],
  api: [
    { key: 'url', label: 'URL', type: 'url', placeholder: 'https://api.example.com' },
    { key: 'method', label: 'Method', type: 'text', placeholder: 'GET', options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' },
    { key: 'token', label: 'Token', type: 'password', placeholder: 'Bearer eyJ...' },
    { key: 'headers', label: 'Headers', type: 'multiline', placeholder: 'Content-Type: application/json' },
    { key: 'note', label: '비고', type: 'multiline', placeholder: 'Rate limit, 인증 방식 등' },
  ],
  markdown: [
    { key: 'content', label: '내용', type: 'multiline', placeholder: '마크다운으로 자유롭게 입력하세요...' },
  ],
  document: [],
}

// ─── 타입별 메타 정보 ───────────────────────────────────

export interface TypeMeta {
  label: string
  icon: string      // Lucide 아이콘 이름
  colorKey: string   // CSS 변수 접두사 (badge-ssh, badge-db 등)
}

export const TYPE_META: Record<ItemType, TypeMeta> = {
  server:   { label: 'Server',   icon: 'Terminal',   colorKey: 'server' },
  db:       { label: 'DB',       icon: 'Database',   colorKey: 'db' },
  api:      { label: 'API',      icon: 'Globe',      colorKey: 'api' },
  markdown: { label: 'Markdown', icon: 'FileText',   colorKey: 'markdown' },
  document: { label: 'Document', icon: 'FileStack',  colorKey: 'document' },
}
