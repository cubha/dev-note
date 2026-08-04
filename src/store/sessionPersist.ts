// src/store/sessionPersist.ts
//
// 열린 탭 세션(openTabs/activeTab) localStorage 영속 — 순수 IO만.
// DB 접근(라이브 아이템 필터링·드래프트 병합·GC)은 App.tsx 부팅 로직이 담당한다.

export const SESSION_STORAGE_KEY = 'dev-note:session-tabs'

export interface SessionSnapshot {
  openTabs: number[]
  activeTab: number | null
}

/** localStorage에서 세션 스냅샷을 읽는다. 없거나 형식이 손상됐으면 null(복원 스킵) */
export function loadSessionSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (!Array.isArray(obj.openTabs) || !obj.openTabs.every((id) => typeof id === 'number')) return null
    if (typeof obj.activeTab !== 'number' && obj.activeTab !== null) return null
    return { openTabs: obj.openTabs as number[], activeTab: (obj.activeTab as number | null) ?? null }
  } catch {
    return null
  }
}

/** 세션 스냅샷을 localStorage에 기록한다. 실패(프라이빗 모드 등)는 조용히 무시 */
export function saveSessionSnapshot(snapshot: SessionSnapshot): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // localStorage 쓰기 실패 시 무시
  }
}
