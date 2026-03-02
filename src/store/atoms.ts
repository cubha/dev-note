import { atom } from 'jotai'
import type { AppConfig } from '../core/db'

// ─── 탭 관리 ──────────────────────────────────────────────────

/** 현재 열린 탭의 Item ID 목록 (순서 = 탭 표시 순서) */
export const openTabsAtom = atom<number[]>([])

/** 현재 포커스된 탭의 Item ID */
export const activeTabAtom = atom<number | null>(null)

/** 미저장 변경이 있는 Item ID Set (탭에 dot 표시용) */
export const dirtyItemsAtom = atom<Set<number>>(new Set<number>())

// ─── 암호화 세션 ──────────────────────────────────────────────

/**
 * PBKDF2로 파생된 AES-GCM CryptoKey
 * - 메모리에만 존재, 새로고침 시 자동 소멸
 * - null = 암호화 비활성 또는 아직 잠금 해제 전
 */
export const cryptoKeyAtom = atom<CryptoKey | null>(null)

// ─── 사이드바 ─────────────────────────────────────────────────

/** 사이드바에서 선택된 폴더 ID (null = 루트) */
export const selectedFolderAtom = atom<number | null>(null)

/** 사이드바에서 펼쳐진 폴더 ID Set */
export const expandedFoldersAtom = atom<Set<number>>(new Set<number>())

// ─── 검색 ─────────────────────────────────────────────────────

export const searchOpenAtom  = atom<boolean>(false)
export const searchQueryAtom = atom<string>('')

// ─── 앱 설정 (DB에서 로드 후 저장) ───────────────────────────

export const appConfigAtom = atom<AppConfig | null>(null)
