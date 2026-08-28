// src/shared/hooks/useEscapeKey.ts
//
// 오버레이(모달·확인창·플로팅 뷰)의 Escape 닫기 — **이 앱에서 Escape를 받는 유일한 경로**다.
// 직접 addEventListener를 달지 말고 이 훅을 쓴다. 이유 두 가지가 코드로 강제된다:
//
// 1) **window/bubble이 아니라 document capture여야 한다.**
//    @tanstack/react-hotkeys(escape.clear)가 document에서 Escape 전파를 끊어 window 버블
//    리스너에는 이벤트가 도달하지 않는다(실측: doc-capture·doc-bubble만 발화, win-bubble 미발화).
//    이걸 모르고 window에 달면 **에러 없이 조용히 무동작**이 된다 — 실제로 v1.3 이후 여러 모달의
//    ESC 닫기가 그렇게 죽어 있었다.
//
// 2) **겹쳤을 때 최상단 하나만 닫혀야 한다.**
//    오버레이마다 리스너를 달면 등록 순서대로 실행돼 아래 깔린 모달이 먼저 닫힌다.
//    리스너는 여기 하나뿐이고, 실제 대상 선택은 escapeStack이 한다.

import { useEffect, useRef } from 'react'
import { pushEscapeHandler, dispatchEscape } from '../utils/escapeStack'

let listenerAttached = false

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  // 처리한 경우에만 전파를 끊는다 — 열린 오버레이가 없으면 escape.clear(선택 해제·검색 초기화)가
  // 평소대로 동작해야 한다.
  if (dispatchEscape()) e.stopPropagation()
}

/**
 * @param onEscape Escape 시 실행할 동작 (매 렌더 새로 만들어도 됨 — ref로 잡아 스택 순서에 영향 없음)
 * @param enabled  false면 등록하지 않는다 (저장 중 취소 차단 등)
 */
export const useEscapeKey = (onEscape: () => void, enabled = true) => {
  // 콜백을 ref로 잡는 이유: onEscape 신원이 바뀔 때마다 effect가 재실행되면 등록이 해제·재등록되어
  // **스택 맨 위로 올라가 버린다**. 그러면 겹친 상황에서 닫히는 대상이 렌더 타이밍에 따라 달라진다.
  const handlerRef = useRef(onEscape)
  useEffect(() => {
    handlerRef.current = onEscape
  })

  useEffect(() => {
    if (!enabled) return

    const release = pushEscapeHandler(() => handlerRef.current())
    if (!listenerAttached) {
      document.addEventListener('keydown', onKeyDown, true)
      listenerAttached = true
    }

    return () => {
      release()
      // 리스너는 떼지 않는다 — 스택이 비어도 dispatchEscape가 false를 반환해 무해하고,
      // 여닫을 때마다 붙였다 떼면 다른 capture 리스너 대비 실행 순서가 흔들린다.
    }
  }, [enabled])
}
