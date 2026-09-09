// src/shared/utils/editorExtensions.ts
//
// CodeMirror 공용 extension — 주석 하이라이팅 · 검색 하이라이트
//
// 검색 UI(패널·단축키·매치 순회)는 앱이 소유한다(features/cards/CardSearchPanel).
// CodeMirror 쪽은 "카드 검색이 찾은 것을 코드 섹션에도 칠해주는" 역할만 한다.

import {
  EditorState as CMState, StateEffect, StateField, RangeSetBuilder,
  type Extension,
} from '@codemirror/state'
import {
  MatchDecorator, Decoration, ViewPlugin, EditorView,
  type DecorationSet, type ViewUpdate,
} from '@codemirror/view'
import { buildMatcher } from '../../core/cardSearch'
import type { SearchOptions } from '../../core/cardSearch'

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

// ── 검색 하이라이트 ──────────────────────────────────────────
//
// `@codemirror/search`의 하이라이터를 쓰지 않는 이유: 그쪽은 **CM 자체 패널이 열려 있을 때만**
// 그린다(`highlight({query, panel})`이 `if (!panel) return Decoration.none`). 카드 전역 검색은
// 패널을 카드 레벨에 하나만 두므로 CM 패널을 열지 않고, 따라서 하이라이트도 직접 그려야 한다.
// 매처를 `core/cardSearch`와 공유하므로 패널 카운터와 하이라이트가 같은 규칙으로 움직인다.

interface HighlightSpec {
  query: string
  options: SearchOptions
}

export const setSearchHighlight = StateEffect.define<HighlightSpec | null>()

const searchHighlightField = StateField.define<HighlightSpec | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSearchHighlight)) return e.value
    return value
  },
})

const matchMark = Decoration.mark({ class: 'cm-searchMatch' })
const selectedMatchMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' })

const searchHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = this.build(view) }
    update(update: ViewUpdate) {
      if (
        update.docChanged || update.selectionSet || update.viewportChanged ||
        update.startState.field(searchHighlightField) !== update.state.field(searchHighlightField)
      ) {
        this.decorations = this.build(update.view)
      }
    }

    build(view: EditorView): DecorationSet {
      const spec = view.state.field(searchHighlightField)
      if (!spec?.query) return Decoration.none
      const re = buildMatcher(spec.query, spec.options)
      if (!re) return Decoration.none

      const text = view.state.doc.toString()
      const builder = new RangeSetBuilder<Decoration>()
      re.lastIndex = 0
      let hit: RegExpExecArray | null
      while ((hit = re.exec(text)) !== null) {
        if (hit[0] === '') { re.lastIndex += 1; continue }   // 빈 매치 무한루프 차단
        const from = hit.index
        const to = from + hit[0].length
        // 현재 매치는 앱이 selection으로 옮겨놓으므로, 선택 범위와 겹치면 강조색으로 칠한다
        const selected = view.state.selection.ranges.some((r) => r.from === from && r.to === to)
        builder.add(from, to, selected ? selectedMatchMark : matchMark)
      }
      return builder.finish()
    }
  },
  { decorations: (v) => v.decorations },
)

/** 검색 하이라이트 묶음. NoteEditor·CodeSectionView 양쪽에 부착한다. */
export const searchExtension: Extension = [
  searchHighlightField,
  searchHighlighter,
  EditorView.theme({
    '.cm-searchMatch': { backgroundColor: 'var(--bg-search-match)' },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--bg-search-match-active)', outline: '1px solid var(--border-accent)',
    },
  }),
]
