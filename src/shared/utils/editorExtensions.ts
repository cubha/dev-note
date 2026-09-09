// src/shared/utils/editorExtensions.ts
//
// CodeMirror 공용 extension — 주석 하이라이팅 · 찾기/바꾸기

import {
  EditorState as CMState, StateEffect, StateField,
  type Extension,
} from '@codemirror/state'
import {
  MatchDecorator, Decoration, ViewPlugin, keymap, EditorView,
  type DecorationSet, type ViewUpdate, type Command,
} from '@codemirror/view'
import {
  search, openSearchPanel, closeSearchPanel, findNext, findPrevious,
  setSearchQuery, SearchQuery,
} from '@codemirror/search'

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

// ── 찾기/바꾸기 (Ctrl+F · Ctrl+H) ────────────────────────────

/**
 * 바꾸기 행 접힘 상태.
 *
 * `view.dom.classList`를 직접 건드리면 안 된다 — CM은 뷰 업데이트마다 `.cm-editor`의
 * className을 `"cm-editor" + focus + themeClasses`로 **통째 재계산**하므로, 수동으로 붙인
 * 클래스가 다음 dispatch(=패널 열기)에서 곧바로 지워진다(실기 확인된 결함).
 * 상태를 EditorState에 두고 `editorAttributes`로 선언해야 재계산에도 살아남는다.
 */
const setReplaceCollapsed = StateEffect.define<boolean>()

const replaceCollapsedField = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setReplaceCollapsed)) return e.value
    return value
  },
})

/**
 * 검색/바꾸기 extension 묶음. NoteEditor·CodeSectionView 양쪽에 반드시 부착한다 —
 * 부착하지 않으면 첫 Ctrl+F 사용 시 CodeMirror가 appendConfig로 기본(영문·하단·literal:false)
 * 패널을 자가 설치해 이 파일의 한글화·토큰 스타일과 어긋난 패널이 뜬다.
 */
/**
 * 검색 쿼리에 `literal`을 강제한다.
 *
 * `search({ literal: true })`만으로는 부족하다 — 라이브러리의 `SearchPanel.commit()`이
 * `new SearchQuery({...})`를 만들 때 `literal`을 넘기지 않아, **사용자가 검색창에 타이핑하는
 * 순간 config가 무시되고 `literal: false`로 리셋된다**(실기 확인).
 * 그러면 `C:\temp`를 검색할 때 `\t`가 탭으로 해석돼 "화면에 보이는데 검색이 안 되는" 상태가 된다.
 * 정규식 모드는 이스케이프 해석이 본래 의도이므로 건드리지 않는다.
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

export const searchExtension: Extension = [
  replaceCollapsedField,
  forceLiteralSearch,
  EditorView.editorAttributes.of((view) =>
    view.state.field(replaceCollapsedField, false) ? { class: 'cm-replace-collapsed' } : null
  ),
  search({
    top: true,      // Notepad/VS Code 관행 — 상단 도킹
    literal: true,   // 개발 노트 특성상 경로·코드 검색이 잦아 \t\n\r 이스케이프 해석을 끈다
  }),
  CMState.phrases.of({
    Find: '찾기',
    Replace: '바꿀 내용',
    next: '다음',
    previous: '이전',
    all: '모두 선택',
    'match case': '대소문자 구분',
    regexp: '정규식',
    'by word': '단어 단위',
    replace: '바꾸기',
    'replace all': '모두 바꾸기',
    close: '닫기',
    // 아래 4개는 스크린리더 안내(EditorView.announce)용. `$`는 CM이 값으로 치환하는
    // 플레이스홀더라 번역문에도 반드시 남겨야 한다.
    'replaced $ matches': '$개를 바꿨습니다',
    'replaced match on line $': '$번째 줄에서 바꿨습니다',
    'current match': '현재 일치',
    'on line': '줄',
  }),
  // 패널 내부 고정 키 — 사용자 재할당 대상(editor.find/editor.replace)과 별개로
  // searchKeymap을 통째로 쓰지 않고 필요한 것만 스코프 등록한다.
  keymap.of([
    { key: 'Escape', run: closeSearchPanel, scope: 'editor search-panel' },
    { key: 'F3', run: findNext, shift: findPrevious, scope: 'editor search-panel', preventDefault: true },
  ]),
  EditorView.theme({
    '.cm-panels': { background: 'var(--bg-surface)', color: 'var(--text-secondary)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border-default)' },
    '.cm-panel.cm-search': { padding: '6px 8px', fontSize: '12px', display: 'flex', flexWrap: 'wrap', gap: '4px 8px', alignItems: 'center' },
    '.cm-panel.cm-search .cm-textfield': {
      background: 'var(--bg-input)', color: 'var(--text-primary)',
      border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 6px',
    },
    '.cm-panel.cm-search .cm-textfield:focus': { outline: 'none', borderColor: 'var(--border-accent)' },
    '.cm-panel.cm-search .cm-button': {
      background: 'var(--bg-input)', backgroundImage: 'none', color: 'var(--text-secondary)',
      border: '1px solid var(--border-default)', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer',
    },
    '.cm-panel.cm-search .cm-button:hover': { background: 'var(--bg-input-hover)', color: 'var(--text-primary)' },
    '.cm-panel.cm-search label': { color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '2px' },
    '.cm-panel.cm-search [name=close]': {
      background: 'transparent', backgroundImage: 'none', border: 'none', color: 'var(--text-tertiary)',
      padding: '0 4px', marginLeft: 'auto',
    },
    '.cm-searchMatch': { backgroundColor: 'var(--bg-search-match)' },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--bg-search-match-active)', outline: '1px solid var(--border-accent)',
    },
    // 바꾸기 행 접기 (Ctrl+F=접힘 / Ctrl+H=펼침) — openFindPanel/openReplacePanel이 토글하는 클래스
    '&.cm-replace-collapsed .cm-panel.cm-search br': { display: 'none' },
    '&.cm-replace-collapsed .cm-panel.cm-search [name=replace]': { display: 'none' },
    '&.cm-replace-collapsed .cm-panel.cm-search [name=replaceAll]': { display: 'none' },
  }),
]

/** Ctrl+F — 찾기 패널 열기 (바꾸기 행 접힘) */
export const openFindPanel: Command = (view) => {
  view.dispatch({ effects: setReplaceCollapsed.of(true) })
  openSearchPanel(view)
  return true
}

/** Ctrl+H — 바꾸기 패널 열기 (바꾸기 행 펼침 + 바꿀 내용 필드 포커스) */
export const openReplacePanel: Command = (view) => {
  view.dispatch({ effects: setReplaceCollapsed.of(false) })
  openSearchPanel(view)
  // 패널 DOM은 다음 프레임에 생성될 수 있다. 셀렉터가 어긋나도 포커스만 안 옮겨질 뿐
  // 패널 자체는 정상 동작 — 조용히 degrade하는 쪽을 의도적으로 택한다.
  requestAnimationFrame(() => {
    view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]')?.focus()
  })
  return true
}
