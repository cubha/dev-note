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

/** 구조화된 카드 콘텐츠 (encryptedContent 복호화 후 JSON) */
export interface StructuredContent {
  format: 'structured'
  fields: CardField[]
}

/** 레거시 텍스트 콘텐츠 (이전 버전 호환) */
export interface LegacyContent {
  format: 'legacy'
  text: string
}

/** 통합 콘텐츠 타입 */
export type CardContent = StructuredContent | LegacyContent

// ─── 타입별 기본 필드 스키마 ─────────────────────────────

export interface FieldSchema {
  key: string
  label: string
  type: FieldType
  placeholder?: string
}

/** 아이템 타입별 기본 필드 구성 */
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
    { key: 'method', label: 'Method', type: 'text', placeholder: 'GET / POST / PUT' },
    { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-...' },
    { key: 'token', label: 'Token', type: 'password', placeholder: 'Bearer eyJ...' },
    { key: 'headers', label: 'Headers', type: 'multiline', placeholder: 'Content-Type: application/json' },
    { key: 'note', label: '비고', type: 'multiline', placeholder: 'Rate limit, 인증 방식 등' },
  ],
  note: [
    { key: 'content', label: '내용', type: 'multiline', placeholder: '메모, 코드 스니펫, 명령어 등' },
  ],
  custom: [
    { key: 'content', label: '내용', type: 'multiline', placeholder: '자유 형식으로 입력' },
  ],
}

// ─── 타입별 메타 정보 ───────────────────────────────────

export interface TypeMeta {
  label: string
  icon: string      // Lucide 아이콘 이름
  colorKey: string   // CSS 변수 접두사 (badge-ssh, badge-db 등)
}

export const TYPE_META: Record<ItemType, TypeMeta> = {
  server: { label: 'Server', icon: 'Terminal',  colorKey: 'server' },
  db:     { label: 'DB',     icon: 'Database',  colorKey: 'db' },
  api:    { label: 'API',    icon: 'Globe',     colorKey: 'api' },
  note:   { label: 'Note',   icon: 'FileText',  colorKey: 'note' },
  custom: { label: 'Custom', icon: 'Puzzle',    colorKey: 'custom' },
}
