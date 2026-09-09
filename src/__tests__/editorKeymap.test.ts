import { describe, it, expect } from 'vitest'
import { buildEditorKeymap } from '../shared/utils/editorKeymap'
import { getEffectiveBindings, DEFAULT_KEYBINDINGS } from '../core/keybindings'
import type { CommandId } from '../core/keybindings'

// CodeMirror 6는 keydown의 event.key(Shift 없는 알파벳은 소문자)로 키맵을 조회한다.
// 'Mod+F'를 'Mod-F'(대문자)로 넘기면 대문자 F = Shift가 눌린 상태를 뜻해
// Ctrl+Shift+F에 바인딩되고 정작 Ctrl+F는 죽는다 — 실기에서 확인된 결함.

describe('buildEditorKeymap — CM6 키 포맷 변환', () => {
  const keysFor = (bindings: Record<CommandId, string>) =>
    buildEditorKeymap(bindings).map((b) => b.key)

  it('Mod+F / Mod+H를 소문자 base key로 변환한다 (대문자면 Shift 조합이 되어 죽는다)', () => {
    const keys = keysFor(getEffectiveBindings({}))
    expect(keys).toContain('Mod-f')
    expect(keys).toContain('Mod-h')
    expect(keys).not.toContain('Mod-F')
    expect(keys).not.toContain('Mod-H')
  })

  it('Shift가 명시된 조합도 base key는 소문자다', () => {
    // CM6는 Ctrl+Shift+K에서 base name 'k'(소문자)로 조회한다 — 'Shift-Mod-K'는 매칭 실패
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
      'editor.find': 'Mod+G',
    } as Record<CommandId, string>
    expect(keysFor(custom)).toContain('Mod-g')
  })

  it('비활성화된 커맨드는 키맵에서 제외된다 (브라우저 기본 동작 폴백 경로)', () => {
    const keys = keysFor(getEffectiveBindings({
      'editor.find': { userKey: null, enabled: false },
    }))
    expect(keys).not.toContain('Mod-f')
    expect(keys).toContain('Mod-h')
  })

  it('에디터 카테고리 커맨드 전부가 키맵에 실린다', () => {
    const editorCommands = (Object.keys(DEFAULT_KEYBINDINGS) as CommandId[])
      .filter((id) => DEFAULT_KEYBINDINGS[id].category === 'editor')
    expect(buildEditorKeymap(getEffectiveBindings({}))).toHaveLength(editorCommands.length)
  })
})
