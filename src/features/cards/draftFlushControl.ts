// src/features/cards/draftFlushControl.ts
//
// CardDetailEditor/DocumentEditor는 앱 전체 단일 인스턴스라, 탭 전환 시 컴포넌트가
// 언마운트되지 않고 상태만 리셋된다. 탭 닫기(폐기)가 "방금 지운 드래프트를 탭전환
// cleanup-flush가 되살리는" 레이스를 피하려면, React state/Jotai atom이 아닌
// 순수 JS 모듈 상태로 억제 플래그를 동기적으로 공유해야 한다 — 같은 커밋 안에서
// atom 갱신과 effect cleanup의 실행 순서는 React가 보장해주지 않는다.

interface ActiveFlushEntry {
  itemId: number
  run: () => void
  /** 이 탭의 handleSave — 닫기 confirm의 "저장"이 활성 탭을 대상으로 할 때 이걸 써야 한다.
   *  commitDraftToItem(컴포넌트 상태 밖에서 동작)을 활성 탭에 쓰면, 커밋 직후에도 컴포넌트의
   *  dirtyRef/디바운스 effect가 그대로 살아있어 방금 지운 드래프트를 되살리는 레이스가 생긴다
   *  (scope-critic SubTask6 지적). handleSave는 dirtyRef를 동기적으로 false로 낮춰 이를 막는다. */
  save: () => Promise<void>
}

let activeFlush: ActiveFlushEntry | null = null
let suppressedItemId: number | null = null

/** 현재 활성 탭의 flush/save 함수를 등록/해제한다. itemId가 없으면(entry=null) 해제만 한다. */
export function registerActiveFlush(entry: ActiveFlushEntry | null): void {
  activeFlush = entry
}

/** 외부(닫기 confirm 등)에서 activeTab의 최신 편집분을 즉시 drafts에 반영한다. */
export function flushIfActive(itemId: number): void {
  if (activeFlush && activeFlush.itemId === itemId) activeFlush.run()
}

/**
 * itemId가 활성 탭이면 그 탭의 handleSave를 호출해 저장하고 true를 반환한다.
 * 활성 탭이 아니면 아무 것도 하지 않고 false — 호출부는 이때 commitDraftToItem으로 폴백해야 한다.
 */
export async function saveIfActive(itemId: number): Promise<boolean> {
  if (activeFlush && activeFlush.itemId === itemId) {
    await activeFlush.save()
    return true
  }
  return false
}

/** 다음 1회의 자동 flush(탭전환 cleanup)를 억제한다 — 닫기/폐기 직후 드래프트 재생성 방지. */
export function suppressNextFlush(itemId: number): void {
  suppressedItemId = itemId
}

/** 억제 플래그를 소비한다(1회성). 대상이면 true를 반환하고 플래그를 리셋한다. */
export function consumeSuppression(itemId: number): boolean {
  if (suppressedItemId === itemId) {
    suppressedItemId = null
    return true
  }
  return false
}
