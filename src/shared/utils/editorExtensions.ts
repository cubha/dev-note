// src/shared/utils/editorExtensions.ts
//
// CodeMirror 공용 extension — 주석 하이라이팅

import {
  EditorState as CMState,
  type Extension,
} from '@codemirror/state'
import {
  MatchDecorator, Decoration, ViewPlugin,
  type DecorationSet, type ViewUpdate, type EditorView,
} from '@codemirror/view'

/** 언어 모드 미설정 시 기본 주석 토큰 (// 스타일) */
export const defaultCommentTokens: Extension = CMState.languageData.of(
  () => [{ commentTokens: { line: '//' } }]
)

/** // 주석 시각적 하이라이팅 */
const commentDecorator = new MatchDecorator({
  regexp: /\/\/.*/g,
  decoration: Decoration.mark({ class: 'cm-comment-highlight' }),
})

export const commentHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = commentDecorator.createDeco(view) }
    update(update: ViewUpdate) { this.decorations = commentDecorator.updateDeco(update, this.decorations) }
  },
  { decorations: v => v.decorations }
)
