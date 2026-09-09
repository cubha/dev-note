import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import {
  replaceCollapsedField,
  setReplaceCollapsed,
  isReplaceCollapsed,
} from '../shared/utils/editorExtensions'

// 펼침 상태는 키보드(Ctrl+H)와 화면 토글 버튼이 공유한다. 두 경로가 같은 이펙트를
// dispatch해야 상태가 갈라지지 않으므로, 상태 전이 자체를 여기서 고정한다.

const stateWithField = () =>
  EditorState.create({ extensions: [replaceCollapsedField] })

const apply = (state: EditorState, collapsed: boolean) =>
  state.update({ effects: setReplaceCollapsed.of(collapsed) }).state

describe('replaceCollapsedField — 바꾸기 행 펼침 상태', () => {
  it('초기 상태는 접힘 — Ctrl+F로 열면 찾기만 보인다', () => {
    expect(isReplaceCollapsed(stateWithField())).toBe(true)
  })

  it('펼침 이펙트를 적용하면 펼쳐진다', () => {
    expect(isReplaceCollapsed(apply(stateWithField(), false))).toBe(false)
  })

  it('다시 접을 수 있다', () => {
    const opened = apply(stateWithField(), false)
    expect(isReplaceCollapsed(apply(opened, true))).toBe(true)
  })

  it('연속 토글이 진동 없이 마지막 값으로 수렴한다', () => {
    let s = stateWithField()
    for (const v of [false, true, false, false, true, false]) s = apply(s, v)
    expect(isReplaceCollapsed(s)).toBe(false)
  })

  it('무관한 트랜잭션에서는 상태가 유지된다', () => {
    const opened = apply(stateWithField(), false)
    const afterEdit = opened.update({ changes: { from: 0, insert: 'hello' } }).state
    expect(isReplaceCollapsed(afterEdit)).toBe(false)
  })

  it('field가 설치되지 않은 state에서도 안전한 기본값(접힘)을 준다', () => {
    // 주입 실패·확장 미부착 상황에서 버튼이 상태를 읽어도 throw하면 안 된다
    const bare = EditorState.create({})
    expect(() => isReplaceCollapsed(bare)).not.toThrow()
    expect(isReplaceCollapsed(bare)).toBe(true)
  })
})
