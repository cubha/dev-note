import { atom } from 'jotai'
import type { AppConfig, Item, ItemType } from '../core/db'
import type { CardContent as CardContentType } from '../core/types'

// ─── 탭 관리 ──────────────────────────────────────────────────

/** 현재 열린 탭의 Item ID 목록 (순서 = 탭 표시 순서) */
export const openTabsAtom = atom<number[]>([])

/** 현재 포커스된 탭의 Item ID */
export const activeTabAtom = atom<number | null>(null)

/** 미저장 변경이 있는 Item ID Set (탭에 dot 표시용) */
export const dirtyItemsAtom = atom<Set<number>>(new Set<number>())

// ─── 사이드바 ─────────────────────────────────────────────────

/** 사이드바에서 선택된 폴더 ID (null = 루트) */
export const selectedFolderAtom = atom<number | null>(null)

/** 사이드바에서 펼쳐진 폴더 ID Set */
export const expandedFoldersAtom = atom<Set<number>>(new Set<number>())

/** 사이드바 접기/펼치기 */
export const sidebarCollapsedAtom = atom<boolean>(false)

// ─── 검색 ─────────────────────────────────────────────────────

export const searchOpenAtom  = atom<boolean>(false)
export const searchQueryAtom = atom<string>('')

// ─── 앱 설정 (DB에서 로드 후 저장) ───────────────────────────

export const appConfigAtom = atom<AppConfig | null>(null)

// ─── 컨텍스트 메뉴 ────────────────────────────────────────────

export interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  targetId: number | null
  type: 'folder' | 'item' | null
}

export const contextMenuAtom = atom<ContextMenuState>({
  isOpen: false,
  x: 0,
  y: 0,
  targetId: null,
  type: null,
})

// ─── 탭 컨텍스트 메뉴 ─────────────────────────────────────────

export interface TabContextMenuState {
  isOpen: boolean
  x: number
  y: number
  tabId: number | null
}

export const tabContextMenuAtom = atom<TabContextMenuState>({
  isOpen: false,
  x: 0,
  y: 0,
  tabId: null,
})

// ─── 환경설정 모달 ────────────────────────────────────────────

export const settingsOpenAtom = atom<boolean>(false)

// ─── 인라인 이름 변경 ─────────────────────────────────────────

export interface RenamingTarget {
  id: number
  type: 'folder' | 'item'
}

export const renamingTargetAtom = atom<RenamingTarget | null>(null)

// ─── DnD 드롭 대상 ────────────────────────────────────────────

/** DnD 드래그 중 hover 중인 드롭 대상 폴더 ID (hover highlight 용) */
export const dragOverFolderAtom = atom<number | null>(null)

// ─── 다중 선택 ────────────────────────────────────────────────

/** 사이드바에서 다중 선택된 Item ID Set */
export const selectedItemsAtom = atom<Set<number>>(new Set<number>())

/** Shift+Click 범위 선택 앵커 — 마지막으로 선택된 Item ID */
export const lastSelectedItemAtom = atom<number | null>(null)

/** 현재 사이드바에 보이는 아이템 ID 순서 배열 (Shift+Click 범위 계산용) */
export const flatVisibleItemIdsAtom = atom<number[]>([])

// ─── 대시보드 ──────────────────────────────────────────────

/** 카드 폼 모달 상태 */
export interface CardFormState {
  isOpen: boolean
  editItem: Item | null      // null = 새 카드
  folderId: number | null    // 새 카드의 기본 폴더
}

export const cardFormAtom = atom<CardFormState>({
  isOpen: false,
  editItem: null,
  folderId: null,
})

/** 대시보드 타입 필터 (null = 전체) */
export const typeFilterAtom = atom<ItemType | null>(null)

/** 대시보드 태그 필터 */
export const tagFilterAtom = atom<string | null>(null)

// ─── AI (BYOK — 완전 선택적) ─────────────────────────────────

const AI_KEY_STORAGE_KEY = 'dev-note-claude-key'

/** Claude API 키 (메모리 상태) */
export const aiApiKeyAtom = atom<string | null>(
  sessionStorage.getItem(AI_KEY_STORAGE_KEY),
)

/** API 키가 설정되어 AI 기능을 사용할 수 있는지 */
export const aiEnabledAtom = atom((get) => get(aiApiKeyAtom) !== null)

/** sessionStorage 연동 write atom (브라우저 닫으면 자동 소멸) */
export const aiApiKeyPersistAtom = atom(
  (get) => get(aiApiKeyAtom),
  (_get, set, key: string | null) => {
    if (key) {
      sessionStorage.setItem(AI_KEY_STORAGE_KEY, key)
    } else {
      sessionStorage.removeItem(AI_KEY_STORAGE_KEY)
    }
    set(aiApiKeyAtom, key)
  },
)

// ─── 공지사항 & 가이드 ──────────────────────────────────────────

export const announcementOpenAtom = atom<boolean>(false)
export const guideOpenAtom = atom<boolean>(false)

// ─── 카드 플로팅 뷰 ────────────────────────────────────────────

/** 조회 전용 플로팅 뷰에 표시할 카드 (null = 닫힘) */
export interface CardViewState {
  item: Item
  content: CardContentType
}

export const cardViewAtom = atom<CardViewState | null>(null)
