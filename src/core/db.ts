import Dexie, { type EntityTable } from 'dexie'
import { nanoid } from 'nanoid'

// ─── 타입 정의 ────────────────────────────────────────────────

export type ItemType = 'server' | 'db' | 'api' | 'note' | 'document'

export interface Folder {
  id: number
  parentId: number | null  // null = 루트
  name: string             // at-rest 암호화 (metaCrypto). 표시 전 useDecryptedFolders로 복호화
  order: number
  createdAt: number
}

export interface Item {
  id: number
  folderId: number | null
  title: string             // 사이드바 렌더링, 검색 인덱스 (평문 유지 — 확정 설계)
  type: ItemType
  tags: string[]            // 원소별 at-rest 암호화 (metaCrypto). 필터는 복호화 후 메모리에서 수행
  order: number             // 정렬 순서 (인덱스 제외)
  pinned: boolean           // 즐겨찾기/핀 고정
  content: string           // JSON string (StructuredContent | LegacyContent)
  updatedAt: number
  createdAt: number
  // ── 동기화 (Phase 2 BYO-storage) — 옵트인. 미동기화 노트는 undefined ──
  uuid?: string             // 기기 간 안정적 식별자 ({uuid}.enc). 동기화 시 지연 부여
  // 미저장 새 카드 표시 — true면 목록/사이드바/검색에서 제외되고 탭에서만 보인다.
  // isDraft(item) 술어(core/cardState.ts) 한 곳에서만 판정한다(undefined도 non-draft로 취급).
  draft?: boolean
}

/**
 * 동기화 상태(per-note) — items와 분리한 단일 진실 원천.
 * 노트 행이 삭제돼도 살아남아 "동기화됐던 노트가 로컬에서 삭제됨"(tombstone 전파)을 감지한다.
 */
export interface SyncState {
  uuid: string              // PK
  syncedVersion: string     // 마지막으로 클라우드와 일치한 페이로드 해시 (3-way base)
}

/**
 * 탭 드래프트(미저장 편집분) — items와 분리된 테이블.
 * items에 컬럼으로 두면 write→useLiveQuery 재발화→로더가 편집 중인 값을 덮어쓰는
 * 재진입 루프가 생기므로 별도 테이블로 둔다.
 * 암호화된 카드도 대상이다 — 잠금 해제 상태에서만 기록하며 body는 세션 키로 암호화한다
 * (title/type/tags는 items와 동일하게 평문 — 사이드바·검색 인덱스 제약).
 */
export interface DraftRow {
  itemId: number      // PK — items.id 참조
  title: string
  type: ItemType
  tags: string         // 쉼표구분 원문 (에디터 상태와 동일 포맷)
  body: string          // DraftBody JSON (core/draft.ts의 serializeDraftBody)
  baseUpdatedAt: number  // 드래프트를 뜬 시점의 원본 items.updatedAt — stale 감지용(현재는 기록만, 충돌 UI는 범위 외)
  updatedAt: number     // 드래프트 마지막 기록 시각
}

export type AIProvider = 'anthropic' | 'google' | 'openai'

export interface AppConfig {
  id: 1                   // 단일 레코드
  theme: 'dark' | 'light'
  editorFontSize: number
  wordWrap: boolean        // 자동 줄바꿈
  showLineNumbers: boolean // 줄 번호 표시
  lastExportAt: number | null
  selectedProvider: AIProvider  // 기본: 'anthropic'
  // userApiKey는 여기 없다 — BYOK 키는 세션 메모리(userApiKeyAtom) 전용이다.
  // v18 이전에는 이 필드에 평문 저장했고, at-rest 암호화를 켜도 config는 암호화 대상이
  // 아니라 키가 그대로 노출됐다(CLAUDE.md "API 키를 클라이언트에 저장 금지" 위반).
  encryptionEnabled: boolean    // at-rest 암호화 활성화 여부
  encryptionSalt: string | null // PBKDF2 salt hex 문자열
  // 고정 평문을 암호화해 둔 카나리 — 잠금 해제·패스프레이즈 검증 시 이걸로 우선 확인한다.
  // v19까지는 "첫 번째 암호화된 item.content"로만 검증했는데, 태그·폴더명만 암호화되고
  // content는 하나도 암호화 안 된 상태에서는 그 검증이 통째로 스킵되어 틀린 패스프레이즈도
  // 통과했다(reencryptMeta/decryptAllMeta에 그대로 흘러가 원본을 덮어쓰는 사고로 이어짐).
  encryptionCheck: string | null
  // ── 동기화 설정 (Phase 2 BYO-storage) — 기본 로컬, 옵트인 ──
  syncEnabled: boolean              // 동기화 활성화 여부
  syncProvider: 'google-drive' | null // 선택된 스토리지 프로바이더
  deviceId: string                  // 이 기기의 안정적 식별자 (충돌 사본 라벨링)
  syncCursor: string | null         // 마지막 동기화 시점의 manifest updatedAt 마커
  lastSyncAt: number | null         // 마지막 동기화 완료 시각
}

// ─── Dexie v4 클래스 ──────────────────────────────────────────

class DevNoteDB extends Dexie {
  folders!: EntityTable<Folder, 'id'>
  items!: EntityTable<Item, 'id'>
  config!: EntityTable<AppConfig, 'id'>
  syncState!: EntityTable<SyncState, 'uuid'>
  drafts!: EntityTable<DraftRow, 'itemId'>

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
    // v13: markdown → note 타입 이름 변경
    this.version(13).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, type, order, pinned, updatedAt',
      config:  'id',
    }).upgrade(async (tx) => {
      await tx.table('items').toCollection().modify((item: Record<string, unknown>) => {
        if (item.type === 'markdown') {
          item.type = 'note'
        }
      })
    })
    // v14: AI provider 설정 필드 추가
    this.version(14).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, type, order, pinned, updatedAt',
      config:  'id',
    }).upgrade(tx =>
      tx.table('config').toCollection().modify((c: Record<string, unknown>) => {
        c.selectedProvider = 'anthropic'
        c.userApiKey = ''
      })
    )
    // v15: at-rest 암호화 설정 필드 추가
    this.version(15).stores({
      folders: '++id, parentId, name, order',
      items:   '++id, folderId, title, *tags, type, order, pinned, updatedAt',
      config:  'id',
    }).upgrade(tx =>
      tx.table('config').toCollection().modify((c: Record<string, unknown>) => {
        c.encryptionEnabled = false
        c.encryptionSalt = null
      })
    )
    // v16: 동기화(Phase 2 BYO-storage) — items에 uuid 인덱스, syncState 테이블, config 동기화 설정
    this.version(16).stores({
      folders:   '++id, parentId, name, order',
      items:     '++id, &uuid, folderId, title, *tags, type, order, pinned, updatedAt',
      syncState: 'uuid',
      config:    'id',
    }).upgrade(async (tx) => {
      // 기존 노트에 안정적 uuid 부여 (동기화 준비)
      await tx.table('items').toCollection().modify((item: Record<string, unknown>) => {
        if (!item.uuid) item.uuid = nanoid(16)
      })
      // config: 동기화 기본값 (기본 로컬·미활성)
      await tx.table('config').toCollection().modify((c: Record<string, unknown>) => {
        c.syncEnabled = false
        c.syncProvider = null
        c.deviceId = nanoid(12)
        c.syncCursor = null
        c.lastSyncAt = null
      })
    })
    // v17: 탭 드래프트(미저장 편집분) 영속 — items와 분리된 신규 테이블만 추가(기존 테이블 무변경)
    this.version(17).stores({
      folders:   '++id, parentId, name, order',
      items:     '++id, &uuid, folderId, title, *tags, type, order, pinned, updatedAt',
      syncState: 'uuid',
      config:    'id',
      drafts:    'itemId',
    })
    // v18: BYOK API 키를 config에서 완전 제거 — 세션 메모리 전용으로 전환.
    // 이미 설치된 브라우저의 IndexedDB에는 평문 키가 남아 있으므로 업그레이드 시 지운다.
    // 필드를 인터페이스에서 뺀 것만으로는 기존 행의 값이 사라지지 않는다.
    this.version(18).stores({
      folders:   '++id, parentId, name, order',
      items:     '++id, &uuid, folderId, title, *tags, type, order, pinned, updatedAt',
      syncState: 'uuid',
      config:    'id',
      drafts:    'itemId',
    }).upgrade(async (tx) => {
      await tx.table('config').toCollection().modify((c: Record<string, unknown>) => {
        delete c.userApiKey
      })
    })
    // v19: 태그·폴더명 at-rest 암호화에 따른 인덱스 정리.
    // `*tags`와 folders.name은 암호문을 가리키게 되어 조회에 쓸 수 없다 — 실제로도 어떤
    // 쿼리에서도 쓰이지 않았고(태그 필터·폴더 조회 모두 메모리 방식), 남겨두면 "이 필드로
    // 조회할 수 있다"는 잘못된 신호만 준다. 데이터 변환은 여기서 하지 않는다 —
    // 업그레이드 시점엔 키가 없어서 못 한다. 잠금 해제 시 backfillMeta가 멱등으로 처리한다.
    this.version(19).stores({
      folders:   '++id, parentId, order',
      items:     '++id, &uuid, folderId, title, type, order, pinned, updatedAt',
      syncState: 'uuid',
      config:    'id',
      drafts:    'itemId',
    })
    // v20: 패스프레이즈 검증용 카나리 필드 추가(순수 추가, 인덱스 변경 없음).
    // 기존 행에는 필드가 없으므로 명시적으로 null을 채운다 — 다음 잠금 해제 성공 시
    // SecurityTab이 소급 기록한다.
    this.version(20).stores({
      folders:   '++id, parentId, order',
      items:     '++id, &uuid, folderId, title, type, order, pinned, updatedAt',
      syncState: 'uuid',
      config:    'id',
      drafts:    'itemId',
    }).upgrade(async (tx) => {
      await tx.table('config').toCollection().modify((c: Record<string, unknown>) => {
        c.encryptionCheck = null
      })
    })
    // v21: draft(미저장 새 카드) 플래그 추가. boolean은 IndexedDB 유효 키가 아니라
    // 인덱스에 넣을 수 없다 — items 문자열은 v20과 동일하게 두고 메모리에서 필터한다.
    // 필드가 optional이라 업그레이드 스크립트도 불필요(기존 행은 undefined = non-draft).
    this.version(21).stores({
      folders:   '++id, parentId, order',
      items:     '++id, &uuid, folderId, title, type, order, pinned, updatedAt',
      syncState: 'uuid',
      config:    'id',
      drafts:    'itemId',
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
    selectedProvider: 'anthropic',
    encryptionEnabled: false,
    encryptionSalt: null,
    encryptionCheck: null,
    syncEnabled: false,
    syncProvider: null,
    deviceId: nanoid(12),
    syncCursor: null,
    lastSyncAt: null,
  }
  // add()는 중복 키(id:1) 시 ConstraintError를 던진다. StrictMode의 개발 모드 effect
  // 이중 호출로 빈 DB에서 두 번 동시 호출되면 두 번째 add()가 실패하며 콘솔에 노출됐다.
  // put()은 upsert라 경합해도 예외 없이 마지막 쓰기가 반영되어 동일한 결과로 수렴한다.
  await db.config.put(defaults)
  return defaults
}
