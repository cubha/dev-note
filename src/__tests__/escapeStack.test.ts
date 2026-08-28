import { describe, it, expect, beforeEach } from 'vitest'
import {
  pushEscapeHandler,
  dispatchEscape,
  escapeHandlerCount,
} from '../shared/utils/escapeStack'

// 모듈 전역 스택이라 테스트 간 누수를 막는다.
beforeEach(() => {
  while (escapeHandlerCount() > 0) {
    // 정상 경로로는 release로만 비우므로, 남은 게 있으면 테스트가 잘못된 것.
    throw new Error(`이전 테스트가 핸들러를 남겼다: ${escapeHandlerCount()}개`)
  }
})

describe('escapeStack', () => {
  it('등록된 핸들러가 없으면 아무것도 처리하지 않는다', () => {
    // 열린 오버레이가 없을 때 Escape는 escape.clear(선택 해제·검색 초기화)로 흘러가야 하므로,
    // 여기서 false를 반환해야 호출부가 stopPropagation을 하지 않는다.
    expect(dispatchEscape()).toBe(false)
  })

  it('겹쳤을 때 가장 나중에 등록된(최상단) 핸들러 하나만 실행한다', () => {
    const fired: string[] = []
    const releaseBottom = pushEscapeHandler(() => fired.push('bottom'))
    const releaseTop = pushEscapeHandler(() => fired.push('top'))

    expect(dispatchEscape()).toBe(true)
    // 아래 깔린 모달이 먼저 닫히던 결함의 회귀 방어 — bottom은 절대 실행되면 안 된다.
    expect(fired).toEqual(['top'])

    releaseTop()
    expect(dispatchEscape()).toBe(true)
    expect(fired).toEqual(['top', 'bottom'])

    releaseBottom()
  })

  it('중간 핸들러가 먼저 해제돼도 나머지 순서가 유지된다', () => {
    const fired: string[] = []
    const a = pushEscapeHandler(() => fired.push('a'))
    const b = pushEscapeHandler(() => fired.push('b'))
    const c = pushEscapeHandler(() => fired.push('c'))

    b() // 언마운트 순서가 뒤섞이는 경우
    expect(escapeHandlerCount()).toBe(2)

    dispatchEscape()
    expect(fired).toEqual(['c'])

    c()
    dispatchEscape()
    expect(fired).toEqual(['c', 'a'])

    a()
  })

  it('release를 두 번 호출해도 남의 핸들러를 지우지 않는다', () => {
    const fired: string[] = []
    const releaseA = pushEscapeHandler(() => fired.push('a'))
    const releaseB = pushEscapeHandler(() => fired.push('b'))

    releaseB()
    releaseB() // 중복 해제 (StrictMode 이중 cleanup 등)
    expect(escapeHandlerCount()).toBe(1)

    dispatchEscape()
    expect(fired).toEqual(['a'])

    releaseA()
    expect(escapeHandlerCount()).toBe(0)
  })

  it('같은 함수 참조를 두 번 등록해도 각 release가 하나씩만 제거한다', () => {
    const fn = () => {}
    const r1 = pushEscapeHandler(fn)
    const r2 = pushEscapeHandler(fn)
    expect(escapeHandlerCount()).toBe(2)

    r1()
    expect(escapeHandlerCount()).toBe(1)
    r2()
    expect(escapeHandlerCount()).toBe(0)
  })
})
