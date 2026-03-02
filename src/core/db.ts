import Dexie, { type EntityTable } from 'dexie'

// ─── 타입 정의 ────────────────────────────────────────────────

export type ItemType = 'ssh' | 'db' | 'http' | 'note' | 'custom'

export interface Folder {
  id: number
  parentId: number | null  // null = 루트
  name: string
  order: number
  createdAt: number
}

export interface Item {
  id: number
  folderId: number | null
  title: string             // 평문 (사이드바 렌더링, 검색 인덱스)
  type: ItemType
  tags: string[]            // 평문 (검색 필터)
  // 암호화 필드 — Dexie 스키마 인덱스에서 의도적으로 제외 (Best Practice)
  encryptedContent: string | null   // AES-GCM 암호화된 JSON
  iv: string | null                 // Base64 인코딩된 IV
  updatedAt: number
  createdAt: number
}

export interface AppConfig {
  id: 1                   // 단일 레코드
  cryptoEnabled: boolean
  saltHex: string | null  // PBKDF2 salt (hex)
  theme: 'dark' | 'light'
  editorFontSize: number
  lastExportAt: number | null
}

// ─── Dexie v4 클래스 ──────────────────────────────────────────

class DevNoteDB extends Dexie {
  folders!: EntityTable<Folder, 'id'>
  items!: EntityTable<Item, 'id'>
  config!: EntityTable<AppConfig, 'id'>

  constructor() {
    super('dev-note')
    this.version(1).stores({
      // 인덱싱할 평문 필드만 선언 — encryptedContent, iv 는 제외
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, updatedAt',
      config:  'id',
    })
  }
}

export const db = new DevNoteDB()

// ─── AppConfig 초기화 헬퍼 ────────────────────────────────────

export async function ensureConfig(): Promise<AppConfig> {
  const existing = await db.config.get(1)
  if (existing) return existing

  const defaults: AppConfig = {
    id: 1,
    cryptoEnabled: false,
    saltHex: null,
    theme: 'dark',
    editorFontSize: 14,
    lastExportAt: null,
  }
  await db.config.add(defaults)
  return defaults
}
