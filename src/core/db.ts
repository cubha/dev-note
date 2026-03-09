import Dexie, { type EntityTable } from 'dexie'

// ─── 타입 정의 ────────────────────────────────────────────────

export type ItemType = 'server' | 'db' | 'api' | 'markdown' | 'document'

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
  title: string             // 사이드바 렌더링, 검색 인덱스
  type: ItemType
  tags: string[]            // 검색 필터
  order: number             // 정렬 순서 (인덱스 제외)
  pinned: boolean           // 즐겨찾기/핀 고정
  content: string           // JSON string (StructuredContent | LegacyContent)
  updatedAt: number
  createdAt: number
}

export interface AppConfig {
  id: 1                   // 단일 레코드
  theme: 'dark' | 'light'
  editorFontSize: number
  wordWrap: boolean        // 자동 줄바꿈
  showLineNumbers: boolean // 줄 번호 표시
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
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, updatedAt',
      config:  'id',
    })
    this.version(2).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, updatedAt',
      config:  'id',
    }).upgrade(async (tx) => {
      const configs = await tx.table('config').toArray()
      for (const cfg of configs) {
        await tx.table('config').put({ ...cfg, canaryBlock: null, canaryIv: null })
      }
    })
    this.version(3).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, order, updatedAt',
      config:  'id',
    }).upgrade(async (tx) => {
      const allItems = await tx.table('items').toArray()
      for (const item of allItems as Array<Record<string, unknown>>) {
        if (!('order' in item) || item.order == null) {
          await tx.table('items').put({
            ...item,
            order: (item.createdAt as number) ?? Date.now(),
          })
        }
      }
    })
    this.version(4).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, order, updatedAt',
      config:  'id',
    }).upgrade(async (tx) => {
      const configs = await tx.table('config').toArray()
      for (const cfg of configs as Array<Record<string, unknown>>) {
        await tx.table('config').put({
          ...cfg,
          wordWrap: false,
          tabSize: 2,
        })
      }
    })
    this.version(5).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, order, updatedAt',
      config:  'id',
    }).upgrade(async (tx) => {
      const configs = await tx.table('config').toArray()
      for (const cfg of configs as Array<Record<string, unknown>>) {
        await tx.table('config').put({
          ...cfg,
          theme: cfg['theme'] ?? 'dark',
          showLineNumbers: false,
        })
      }
    })
    this.version(6).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, order, pinned, updatedAt',
      config:  'id',
    }).upgrade(async (tx) => {
      const allItems = await tx.table('items').toArray()
      for (const item of allItems as Array<Record<string, unknown>>) {
        await tx.table('items').put({
          ...item,
          pinned: false,
        })
      }
    })
    // v7: 카드 타입 재정의 — ssh→server, http→api
    this.version(7).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, order, pinned, updatedAt',
      config:  'id',
    }).upgrade(async (tx) => {
      const allItems = await tx.table('items').toArray()
      for (const item of allItems as Array<Record<string, unknown>>) {
        let updated = false
        const patch: Record<string, unknown> = { ...item }
        if (item.type === 'ssh') {
          patch.type = 'server'
          updated = true
        } else if (item.type === 'http') {
          patch.type = 'api'
          updated = true
        }
        if (updated) {
          await tx.table('items').put(patch)
        }
      }
    })
    // v8: 암호화 완전 제거 — encryptedContent/iv → content 평문
    this.version(8).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, order, pinned, updatedAt',
      config:  'id',
    }).upgrade(async (tx) => {
      // items: encryptedContent → content 평문 변환
      await tx.table('items').toCollection().modify((item: Record<string, unknown>) => {
        if (!item.content) {
          // iv가 없으면 평문으로 저장되어 있었음 → 그대로 사용
          if (item.encryptedContent && !item.iv) {
            item.content = item.encryptedContent
          } else {
            // 암호화된 데이터는 복호화 불가 → 빈 구조로 초기화
            item.content = JSON.stringify({ format: 'structured', fields: [] })
          }
        }
        delete item.encryptedContent
        delete item.iv
      })
      // config: 암호화 관련 필드 제거
      await tx.table('config').toCollection().modify((config: Record<string, unknown>) => {
        delete config.cryptoEnabled
        delete config.saltHex
        delete config.canaryBlock
        delete config.canaryIv
      })
    })
    // v9: 임베딩 테이블 추가 (시맨틱 검색용)
    this.version(9).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, order, pinned, updatedAt',
      embeddings: '++id, &itemId, updatedAt',
      config:  'id',
    })
    // v10: document 타입 추가 — items에 type 인덱스 추가
    this.version(10).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, type, order, pinned, updatedAt',
      embeddings: '++id, &itemId, updatedAt',
      config:  'id',
    })
    // v11: note/custom → markdown 타입 통합
    this.version(11).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, type, order, pinned, updatedAt',
      embeddings: '++id, &itemId, updatedAt',
      config:  'id',
    }).upgrade(async (tx) => {
      await tx.table('items').toCollection().modify((item: Record<string, unknown>) => {
        if (item.type === 'note' || item.type === 'custom') {
          item.type = 'markdown'
        }
      })
    })
    // v12: embeddings 테이블 제거 (시맨틱 검색 기능 제거 완료)
    this.version(12).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, type, order, pinned, updatedAt',
      embeddings: null,
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
    theme: 'dark',
    editorFontSize: 14,
    wordWrap: false,
    showLineNumbers: false,
    lastExportAt: null,
  }
  await db.config.add(defaults)
  return defaults
}
