// src/shared/utils/escapeStack.ts
//
// Escape 키를 받을 오버레이(모달·확인창·플로팅 뷰)의 **등록 스택**. DOM에 의존하지 않는 순수 모듈이라
// 단위 테스트로 고정할 수 있다 — DOM 배선은 useEscapeKey가 담당한다.
//
// 왜 스택인가:
//   오버레이마다 document에 리스너를 달면, 같은 노드의 리스너는 capture/bubble과 무관하게
//   **등록 순서대로** 실행된다. 그래서 모달이 겹쳤을 때 Escape가 최상단이 아니라
//   **먼저 마운트된(= 아래에 깔린)** 모달을 닫고, stopPropagation으로 전파까지 끊어
//   정작 위에 떠 있는 확인창은 반응하지 않는다.
//   리스너를 하나만 두고 여기서 **가장 나중에 등록된 것 하나만** 호출하면 그 문제가 사라진다.
//
// "가장 나중에 등록됨 = 최상단"인 이유:
//   오버레이는 열릴 때 마운트되고 닫힐 때 언마운트되므로 스택에는 **실제로 열려 있는 것만** 남고,
//   나중에 열린 쪽이 위에 뜬다. 이 휴리스틱이 깨지는 경우는 "이미 열린 오버레이 위로 z-index가
//   더 낮은 오버레이가 나중에 열리는" 조합뿐인데, 확인창이 뜨면 뒤쪽 조작이 막히므로 발생하지 않는다.

type EscapeHandler = () => void

const stack: EscapeHandler[] = []

/**
 * Escape 핸들러를 스택 맨 위에 올린다. 반환된 함수를 호출하면 등록이 해제된다.
 * 해제는 **자기 자신만** 제거하므로 언마운트 순서가 뒤섞여도 남의 등록을 건드리지 않는다.
 */
export function pushEscapeHandler(handler: EscapeHandler): () => void {
  stack.push(handler)
  let released = false
  return () => {
    if (released) return // 중복 해제로 남의 핸들러를 지우지 않도록
    released = true
    const i = stack.lastIndexOf(handler)
    if (i !== -1) stack.splice(i, 1)
  }
}

/**
 * 최상단 핸들러 하나만 실행한다.
 * @returns 처리했으면 true (호출부는 이때만 stopPropagation 한다)
 */
export function dispatchEscape(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}

/** 현재 등록 수 — 테스트·디버깅용. */
export function escapeHandlerCount(): number {
  return stack.length
}
