import { atom } from 'jotai'
import type { AppConfig, AIProvider, Item, ItemType } from '../core/db'
import type { CardContent as CardContentType } from '../core/types'
import type { UserOverrides, CommandId } from '../core/keybindings'
import { getEffectiveBindings } from '../core/keybindings'
import type { CloseKind } from './tabHelpers'

// ─── 탭 관리 ──────────────────────────────────────────────────

/** 현재 열린 탭의 Item ID 목록 (순서 = 탭 표시 순서) */
export const openTabsAtom = atom<number[]>([])

/** 현재 포커스된 탭의 Item ID */
export const activeTabAtom = atom<number | null>(null)

/** 미저장 변경이 있는 Item ID Set (탭에 dot 표시용) */
export const dirtyItemsAtom = atom<Set<number>>(new Set<number>())

/** 사용자가 명시적으로 탭을 닫으려 하는데 dirty 탭이 포함된 경우 — 3버튼 confirm 대상 */
export interface PendingCloseAction {
  kind: CloseKind
  tabId: number | null   // 'all'은 특정 탭이 없으므로 null
  dirtyTabIds: number[]  // 이 닫기 동작으로 실제 닫힐 탭 중 dirty인 것들
}

/** 닫기 confirm 대기 상태 (null = 닫혀있음) */
export const pendingCloseAtom = atom<PendingCloseAction | null>(null)

// ─── 공용 확인 대화상자 (window.confirm 대체) ─────────────────

/** useConfirm() 호출부가 넘기는 옵션. 라벨 미지정 시 ConfirmHost가 기본값을 채운다. */
export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** true면 확인 버튼이 솔리드 파괴 스타일(삭제 등) */
  destructive?: boolean
}

/**
 * 대기 중인 확인 요청. `resolve`는 호출부의 await를 푸는 유일한 통로이므로
 * **모든 종료 경로에서 반드시 호출**되어야 한다(안 하면 호출부가 조용히 영원히 멈춘다).
 */
export interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
}

/** 확인 대화상자 대기 상태 (null = 닫혀있음) */
export const confirmRequestAtom = atom<ConfirmRequest | null>(null)

/**
 * 사용자의 응답을 기다리는 확인 대화상자가 떠 있는가.
 *
 * ⚠ 이 atom이 필요한 이유: 예전 `window.confirm`은 **JS 메인 스레드를 동기적으로 멈춰서**
 * 확인창이 떠 있는 동안 어떤 keydown 핸들러도 실행될 수 없었다. Promise 기반 자체 대화상자로
 * 바꾸면서 그 암묵적 차단이 사라졌고, 확인창이 떠 있는 채로 전역 단축키가 그대로 동작한다.
 * 그래서 **파괴적 전역 단축키는 이 값으로 반드시 가드해야 한다** — 안 하면 "삭제하시겠습니까?"가
 * 떠 있는 상태에서 Delete 키 한 번으로 확인 없이 삭제가 실행된다(security-auditor 지적).
 */
export const blockingDialogOpenAtom = atom(
  (get) => get(confirmRequestAtom) !== null || get(pendingCloseAtom) !== null,
)

// ─── 사이드바 ─────────────────────────────────────────────────

/** 사이드바에서 선택된 폴더 ID (null = 루트) */
export const selectedFolderAtom = atom<number | null>(null)

/** 사이드바에서 펼쳐진 폴더 ID Set */
export const expandedFoldersAtom = atom<Set<number>>(new Set<number>())

/** 사이드바 접기/펼치기 */
export const sidebarCollapsedAtom = atom<boolean>(false)

/** 모바일에서 사이드바 오버레이 열기/닫기 */
export const sidebarMobileOpenAtom = atom<boolean>(false)

// ─── 검색 ─────────────────────────────────────────────────────

// 검색 결과 오버레이(F2)는 activeTab !== null && searchQuery.trim() !== ''로 파생 판정한다
// (SearchResultsOverlay.tsx) — 별도 열림 atom을 두지 않는다.
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

/** 환경설정 모달 초기 탭 (외부에서 특정 탭으로 열 때 사용) */
export const settingsInitialTabAtom = atom<'general' | 'ai' | 'keybindings' | 'security' | 'sync'>('general')

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

/** 대시보드 정렬 기준 (default = 핀 고정 우선 + order 순, updatedAt = 최근 수정 순, title = 제목 가나다 순) */
export type SortOrder = 'default' | 'updatedAt' | 'title'

/** 대시보드 정렬 기준 */
export const sortOrderAtom = atom<SortOrder>('default')

// ─── AI — Vercel Edge Function 프록시 ────────────────────────

/** 빌드 타임 API URL (.env.local, gitignore) — trailing slash 방어 */
export const SHARED_API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '')

/** 공유 키 모드 사용량 (API 응답 헤더로 갱신, BYOK 모드에서는 null) */
export const aiUsageAtom = atom<{
  remaining: number | null
  resetAt: string | null
  limit: number
}>({ remaining: null, resetAt: null, limit: 20 })

/** 선택된 AI 프로바이더 (AppConfig에서 앱 시작 시 로드) */
export const selectedProviderAtom = atom<AIProvider>('anthropic')

/**
 * 사용자 API 키 (빈 문자열 = 공유 키 모드).
 * **세션 메모리 전용** — localStorage/IndexedDB 저장 금지(encryptionKeyAtom과 동일 규율).
 * v18 이전에는 config.userApiKey에 평문 저장했는데, at-rest 암호화가 config 테이블을
 * 덮지 않아 암호화를 켜도 키가 그대로 읽혔다. 부팅 시 복원하지 않으므로 매 세션 재입력한다.
 */
export const userApiKeyAtom = atom<string>('')

// ─── 공지사항 & 가이드 ──────────────────────────────────────────

export const announcementOpenAtom = atom<boolean>(false)
export const guideOpenAtom = atom<boolean>(false)

// ─── 커맨드 팔레트 ──────────────────────────────────────────────

export const commandPaletteOpenAtom = atom<boolean>(false)

// ─── 카드 플로팅 뷰 ────────────────────────────────────────────

/** 조회 전용 플로팅 뷰에 표시할 카드 (null = 닫힘) */
export interface CardViewState {
  item: Item
  content: CardContentType
}

export const cardViewAtom = atom<CardViewState | null>(null)

// ─── 암호화 키 (세션 메모리 전용 — localStorage/IndexedDB 저장 금지) ──────

/** 패스프레이즈에서 파생된 AES-GCM CryptoKey. 앱 닫으면 소멸. */
export const encryptionKeyAtom = atom<CryptoKey | null>(null)

// ─── 동기화 (Phase 2 BYO-storage — 세션 메모리 전용) ──────────────

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'locked'

/** 현재 동기화 진행 상태 (UI 표시용) */
export const syncStatusAtom = atom<SyncStatus>('idle')

// 참고: 실제 DEK는 syncSession.ts 모듈 메모리에만 보관(원자 노출 안 함 = 누출 표면 최소화).

/** 마지막 동기화 오류 메시지 (없으면 null) */
export const syncLastErrorAtom = atom<string | null>(null)

/** 마지막 동기화 완료 시각 (epoch ms, 없으면 null) */
export const syncLastAtAtom = atom<number | null>(null)

// ─── 키바인딩 설정 ─────────────────────────────────────────────

export const KEYBINDINGS_STORAGE_KEY = 'dev-note:keybindings'

function loadKeybindingOverrides(): UserOverrides {
  try {
    const raw = localStorage.getItem(KEYBINDINGS_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as UserOverrides
  } catch {
    return {}
  }
}

/** 사용자 키바인딩 오버라이드 (localStorage 동기화) */
export const keybindingOverridesAtom = atom<UserOverrides>(
  loadKeybindingOverrides()
)

/** localStorage에 저장하는 write-through atom */
export const keybindingOverridesWriteAtom = atom<
  UserOverrides,
  [UserOverrides],
  void
>(
  (get) => get(keybindingOverridesAtom),
  (_get, set, newOverrides) => {
    set(keybindingOverridesAtom, newOverrides)
    try {
      localStorage.setItem(KEYBINDINGS_STORAGE_KEY, JSON.stringify(newOverrides))
    } catch {
      // localStorage 쓰기 실패 시 무시 (private 모드 등)
    }
  }
)

/** 현재 유효한 키바인딩 맵 (기본값 + 오버라이드 머지) */
export const effectiveKeybindingsAtom = atom<Record<CommandId, string>>(
  (get) => getEffectiveBindings(get(keybindingOverridesAtom))
)
