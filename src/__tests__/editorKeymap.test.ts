import { describe, it, expect } from 'vitest'
import { buildEditorKeymap } from '../shared/utils/editorKeymap'
import { getEffectiveBindings } from '../core/keybindings'
import type { CommandId } from '../core/keybindings'

// CodeMirror 6는 keydown의 event.key(Shift 없는 알파벳은 소문자)로 키맵을 조회한다.
// 'Shift+Mod+K'를 'Shift-Mod-K'(대문자)로 넘기면 매칭에 실패한다 — base key는 항상 소문자여야 한다.
//
// 참고: editor.find(Mod+F)·editor.replace(Mod+H)는 v2.3.0부터 이 키맵에 없다.
// 카드 전역 검색이라 CodeMirror 안이 아니라 전역 키맵에서 처리한다
// (useGlobalKeyboardShortcuts → cardSearchOpenSignalAtom → CardDetailEditor).

describe('buildEditorKeymap — CM6 키 포맷 변환', () => {
  const keysFor = (bindings: Record<CommandId, string>) =>
    buildEditorKeymap(bindings).map((b) => b.key)

  it('Shift가 명시된 조합도 base key는 소문자다', () => {
    const keys = keysFor(getEffectiveBindings({}))
    expect(keys).toContain('Shift-Mod-k')
    expect(keys).not.toContain('Shift-Mod-K')
  })

  it('알파벳이 아닌 키(기호·특수키)는 그대로 보존한다', () => {
    const keys = keysFor(getEffectiveBindings({}))
    expect(keys).toContain('Mod-]')
    expect(keys).toContain('Mod-[')
    expect(keys).toContain('Mod-/')
    expect(keys).toContain('Alt-ArrowUp')
    expect(keys).toContain('Alt-ArrowDown')
    expect(keys).toContain('Shift-Alt-ArrowDown')
  })

  it('사용자 커스텀 단일 알파벳 키도 소문자로 변환된다', () => {
    const custom = {
      ...getEffectiveBindings({}),
      'editor.deleteLine': 'Mod+G',
    } as Record<CommandId, string>
    expect(keysFor(custom)).toContain('Mod-g')
    expect(keysFor(custom)).not.toContain('Mod-G')
  })

  it('비활성화된 커맨드는 키맵에서 제외된다', () => {
    const keys = keysFor(getEffectiveBindings({
      'editor.deleteLine': { userKey: null, enabled: false },
    }))
    expect(keys).not.toContain('Shift-Mod-k')
    expect(keys).toContain('Mod-/')
  })

  it('찾기/바꾸기는 CodeMirror 키맵에 실리지 않는다 — 카드 전역 검색이라 전역 키맵 소관', () => {
    const keys = keysFor(getEffectiveBindings({}))
    expect(keys).not.toContain('Mod-f')
    expect(keys).not.toContain('Mod-h')
  })
})
