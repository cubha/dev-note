// src/shared/utils/editorExtensions.ts
//
// CodeMirror 공용 extension — 주석 하이라이팅 · 찾기/바꾸기

import {
  EditorState as CMState,
  type Extension,
} from '@codemirror/state'
import {
  MatchDecorator, Decoration, ViewPlugin, keymap, EditorView,
  type DecorationSet, type ViewUpdate, type Command,
} from '@codemirror/view'
import {
  search, openSearchPanel, closeSearchPanel, findNext, findPrevious,
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
 * 검색/바꾸기 extension 묶음. NoteEditor·CodeSectionView 양쪽에 반드시 부착한다 —
 * 부착하지 않으면 첫 Ctrl+F 사용 시 CodeMirror가 appendConfig로 기본(영문·하단·literal:false)
 * 패널을 자가 설치해 이 파일의 한글화·토큰 스타일과 어긋난 패널이 뜬다.
 */
export const searchExtension: Extension = [
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

const setReplaceCollapsed = (view: EditorView, collapsed: boolean) => {
  view.dom.classList.toggle('cm-replace-collapsed', collapsed)
}

/** Ctrl+F — 찾기 패널 열기 (바꾸기 행 접힘) */
export const openFindPanel: Command = (view) => {
  setReplaceCollapsed(view, true)
  openSearchPanel(view)
  return true
}

/** Ctrl+H — 바꾸기 패널 열기 (바꾸기 행 펼침 + 바꿀 내용 필드 포커스) */
export const openReplacePanel: Command = (view) => {
  setReplaceCollapsed(view, false)
  openSearchPanel(view)
  // 패널 DOM은 다음 프레임에 생성될 수 있다. 셀렉터가 어긋나도 포커스만 안 옮겨질 뿐
  // 패널 자체는 정상 동작 — 조용히 degrade하는 쪽을 의도적으로 택한다.
  requestAnimationFrame(() => {
    view.dom.querySelector<HTMLInputElement>('.cm-search input[name=replace]')?.focus()
  })
  return true
}
