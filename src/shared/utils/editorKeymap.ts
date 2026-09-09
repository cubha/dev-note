// src/shared/utils/editorKeymap.ts
//
// effectiveKeybindingsAtom의 에디터 단축키를 CodeMirror 6 keymap으로 변환

import type { Command, KeyBinding } from '@codemirror/view'
import {
  indentMore, indentLess, deleteLine, toggleComment,
  moveLineUp, moveLineDown, copyLineDown,
} from '@codemirror/commands'
import type { StateCommand } from '@codemirror/state'
import type { CommandId } from '../../core/keybindings'

/**
 * Mod+Key 포맷 → CM6 키 포맷 변환.
 *
 * base key(마지막 토큰)가 단일 알파벳이면 **반드시 소문자**여야 한다 — CM6는 keydown의
 * `event.key`로 키맵을 조회하는데, 대문자 'F'는 "Shift가 눌린 상태"를 뜻해서
 * 'Mod-F'로 등록하면 Ctrl+Shift+F에 걸리고 정작 Ctrl+F는 죽는다.
 */
function toCM6Key(key: string): string {
  const parts = key.split('+')
  const last = parts[parts.length - 1]
  if (/^[A-Za-z]$/.test(last)) parts[parts.length - 1] = last.toLowerCase()
  return parts.join('-')
}

/** StateCommand → Command 래퍼 */
function stateToView(cmd: StateCommand): Command {
  return (view) => cmd({ state: view.state, dispatch: view.dispatch })
}

type EditorCommandEntry = {
  id: string
  run: Command
}

const EDITOR_COMMANDS: EditorCommandEntry[] = [
  { id: 'editor.indent', run: stateToView(indentMore) },
  { id: 'editor.outdent', run: stateToView(indentLess) },
  { id: 'editor.deleteLine', run: deleteLine },
  { id: 'editor.toggleComment', run: toggleComment },
  { id: 'editor.moveLineUp', run: moveLineUp },
  { id: 'editor.moveLineDown', run: moveLineDown },
  { id: 'editor.copyLineDown', run: copyLineDown },
]

/** effectiveBindings에서 에디터 키바인딩만 추출하여 CM6 KeyBinding[] 생성 */
export function buildEditorKeymap(
  bindings: Record<CommandId, string>,
): KeyBinding[] {
  const result: KeyBinding[] = []

  for (const entry of EDITOR_COMMANDS) {
    const key = bindings[entry.id as CommandId]
    if (key) {
      result.push({
        key: toCM6Key(key),
        run: entry.run,
        preventDefault: true,
      })
    }
  }

  return result
}
