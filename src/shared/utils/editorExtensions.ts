// src/shared/utils/editorExtensions.ts
//
// CodeMirror 공용 extension — 주석 하이라이팅 · 검색 하이라이트
//
// 검색 UI(패널·단축키·매치 순회)는 앱이 소유한다(features/cards/CardSearchPanel).
// CodeMirror는 여기서 **하이라이트 엔진으로만** 쓴다 — `setSearchQuery`를 받으면
// `.cm-searchMatch`를 스스로 그려주므로, 코드 섹션의 전체 매치 표시가 공짜로 따라온다.

import {
  EditorState as CMState,
  type Extension,
} from '@codemirror/state'
import {
  MatchDecorator, Decoration, ViewPlugin, EditorView,
  type DecorationSet, type ViewUpdate,
} from '@codemirror/view'
import { search, setSearchQuery, SearchQuery } from '@codemirror/search'

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

/**
 * 검색 쿼리에 `literal`을 강제한다.
 *
 * `search({ literal: true })` 설정만으로는 부족하다 — 쿼리를 만드는 쪽이 `literal`을 넘기지 않으면
 * `SearchQuery` 생성자가 `false`로 채운다. 그러면 `C:\temp`를 찾을 때 `\t`가 탭으로 해석돼
 * "화면에 보이는데 검색이 안 되는" 상태가 된다. 정규식 모드는 이스케이프 해석이 본래 의도이므로 건드리지 않는다.
 */
const forceLiteralSearch = CMState.transactionFilter.of((tr) => {
  if (!tr.effects.length) return tr
  let patched = false
  const effects = tr.effects.map((e) => {
    if (!e.is(setSearchQuery)) return e
    const q = e.value
    if (q.literal || q.regexp) return e
    patched = true
    return setSearchQuery.of(new SearchQuery({
      search: q.search,
      caseSensitive: q.caseSensitive,
      literal: true,
      regexp: q.regexp,
      replace: q.replace,
      wholeWord: q.wholeWord,
    }))
  })
  return patched ? { effects } : tr
})

/**
 * 검색 하이라이트 묶음. NoteEditor·CodeSectionView 양쪽에 부착한다.
 * 패널은 열지 않는다(`openSearchPanel` 미사용) — 앱 패널이 카드당 하나만 존재해야 하기 때문.
 */
export const searchExtension: Extension = [
  forceLiteralSearch,
  search(),
  CMState.phrases.of({
    // 스크린리더 안내(EditorView.announce)용. `$`는 CM이 값으로 치환하는 플레이스홀더라
    // 번역문에도 반드시 남겨야 한다.
    'replaced $ matches': '$개를 바꿨습니다',
    'replaced match on line $': '$번째 줄에서 바꿨습니다',
    'current match': '현재 일치',
    'on line': '줄',
  }),
  EditorView.theme({
    '.cm-searchMatch': { backgroundColor: 'var(--bg-search-match)' },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--bg-search-match-active)', outline: '1px solid var(--border-accent)',
    },
  }),
]
