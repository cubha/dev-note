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
// 여러 dirty 탭을 한 번에 폐기(전체닫기 등)할 때 각 id마다 suppressNextFlush가 호출되므로
// 단일 스칼라로는 마지막 id만 남고 앞선 id들의 억제가 유실된다(scope-critic SubTask7 지적 —
// 유실된 id의 드래프트가 탭전환 cleanup-flush에 의해 되살아나 "저장 안 함"의 폐기가 무효화됨).
const suppressedItemIds = new Set<number>()

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
  suppressedItemIds.add(itemId)
}

/** 억제 플래그를 소비한다(1회성). 대상이면 true를 반환하고 그 id만 제거한다(다른 id는 유지). */
export function consumeSuppression(itemId: number): boolean {
  if (suppressedItemIds.has(itemId)) {
    suppressedItemIds.delete(itemId)
    return true
  }
  return false
}

// ── 암호화 flush epoch 가드 ──────────────────────────────────────
//
// 암호화 카드의 flush는 saveDraftRaw 전에 encryptContent를 await해야 한다 — 평문 draft와
// 달리 IndexedDB 요청이 같은 틱에서 동기적으로 시작되지 않으므로, 그 await 도중
// handleSave/discard가 먼저 delete를 끝내버리면 뒤늦게 도착한 encrypt 결과가 방금 지운
// 드래프트를 되살릴 수 있다. 모든 의도적 삭제가 epoch을 올리고, flush는 encrypt 전에 캡처한
// epoch과 완료 후의 epoch을 비교해 달라졌으면 쓰기를 스스로 폐기한다.
const draftEpochs = new Map<number, number>()
// SecurityTab의 db.drafts.clear()(암호화 활성/비활성/패스프레이즈 변경)는 테이블 전체를 지우지만
// 어떤 itemId가 영향받는지 호출부가 알 수 없다 — per-item bump로는 커버 못 하므로 전역 카운터로
// 모든 itemId의 in-flight 쓰기를 한 번에 무효화한다. 두 카운터 다 증가만 하므로 합이 그대로면
// 어느 쪽도 안 올랐다는 뜻 — currentDraftEpoch를 두 카운터의 합으로 정의해도 비교가 안전하다.
let globalDraftEpoch = 0

/** 이 itemId의 드래프트를 무효화하는 의도적 삭제(저장 완료·폐기·아이템 삭제)가 일어날 때 호출 */
export function bumpDraftEpoch(itemId: number): void {
  draftEpochs.set(itemId, (draftEpochs.get(itemId) ?? 0) + 1)
}

/** db.drafts.clear()처럼 특정 itemId 없이 테이블 전체를 무효화할 때 호출 */
export function bumpAllDraftEpochs(): void {
  globalDraftEpoch += 1
}

/** 현재 epoch 값 — encrypt 전에 캡처해두고, encrypt 후 재비교해 stale write를 감지한다 */
export function currentDraftEpoch(itemId: number): number {
  return globalDraftEpoch + (draftEpochs.get(itemId) ?? 0)
}
