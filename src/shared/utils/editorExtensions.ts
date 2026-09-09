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
export const setReplaceCollapsed = StateEffect.define<boolean>()

export const replaceCollapsedField = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setReplaceCollapsed)) return e.value
    return value
  },
})

/**
 * 펼침 상태 단일 진입점 — 키보드(Ctrl+H)와 화면 토글 버튼이 같은 값을 읽어야 상태가 갈라지지 않는다.
 * extension이 부착되지 않은 state에서도 throw하지 않고 접힘으로 본다(주입 실패 시 무해 degrade).
 */
export const isReplaceCollapsed = (state: CMState): boolean =>
  state.field(replaceCollapsedField, false) ?? true

/**
 * 검색/바꾸기 extension 묶음. NoteEditor·CodeSectionView 양쪽에 반드시 부착한다 —
 * 부착하지 않으면 첫 Ctrl+F 사용 시 CodeMirror가 appendConfig로 기본(영문·하단·literal:false)
 * 패널을 자가 설치해 이 파일의 한글화·토큰 스타일과 어긋난 패널이 뜬다.
 */
/**
 * 검색 패널 DOM 보강 — CodeMirror 기본 패널을 그대로 쓰되 두 가지를 얹는다.
 *
 * 1. **필드 박스**: `<input>`은 void element라 자식을 못 가지므로, 입력창과 옵션 토글(Aa·ab|·.*)을
 *    감싸는 wrapper를 만들어 "입력창 안에 옵션이 들어있는" VS Code식 배치를 만든다.
 * 2. **펼침 토글**: 기본 패널에는 바꾸기로 넘어가는 버튼이 없어 Ctrl+H를 모르면 도달할 수 없다.
 *    버튼을 주입하고 클릭 시 `setReplaceCollapsed`를 dispatch — Ctrl+H와 완전히 같은 경로다.
 *
 * 노드를 **이동만** 하고 새로 만들거나 지우지 않는다 — `SearchPanel`이 입력·체크박스 노드를
 * 직접 참조하고 이벤트도 노드에 붙어 있어서, 이동은 안전하지만 재생성은 기능을 깬다.
 * 패널은 열 때마다 새로 만들어지므로(`createSearchPanel`) 주입은 멱등하게 반복 확인한다.
 * 구조가 예상과 다르면 아무것도 하지 않고 빠진다 — 기본 패널 모습으로 degrade할 뿐 기능은 산다.
 */
const searchPanelDecor = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) { this.sync(view) }
    update(update: ViewUpdate) { this.sync(update.view) }

    sync(view: EditorView) {
      const panel = view.dom.querySelector<HTMLElement>('.cm-panel.cm-search')
      if (!panel) return
      this.build(panel)

      const toggle = panel.querySelector<HTMLButtonElement>('.cm-replace-toggle')
      if (!toggle) return
      const collapsed = isReplaceCollapsed(view.state)
      toggle.setAttribute('aria-expanded', String(!collapsed))
      toggle.textContent = collapsed ? '▶' : '▼'
      toggle.title = collapsed ? '바꾸기 펼치기' : '바꾸기 접기'
    }

    build(panel: HTMLElement) {
      if (panel.dataset.dnDecorated === '1') return
      const doc = panel.ownerDocument
      const search = panel.querySelector<HTMLInputElement>('input[name=search]')
      const replace = panel.querySelector<HTMLInputElement>('input[name=replace]')
      if (!search) return
      panel.dataset.dnDecorated = '1'

      // 옵션 토글을 입력창과 한 박스에 담는다
      const field = doc.createElement('div')
      field.className = 'cm-search-field'
      search.before(field)
      field.append(search)
      // data 속성으로 표식을 남긴다 — CSS가 `:has()`에 의존하지 않게 하려는 것.
      // `:has()`는 Safari 15.4+/Firefox 121+ 전용이라, 미지원 브라우저에서는 옵션이
      // 축약되지 않고 "대소문자 구분" 원문이 그대로 노출돼 패널이 넓어진다.
      for (const name of ['case', 'word', 're']) {
        const label = panel.querySelector(`input[name=${name}]`)?.closest('label')
        if (label instanceof HTMLElement) {
          label.dataset.dnOpt = name
          field.append(label)
        }
      }

      // 찾기 행 / 바꾸기 행으로 분리 — 접기가 행 단위로 단순해진다
      const findRow = doc.createElement('div')
      findRow.className = 'cm-search-row cm-search-row-find'
      field.before(findRow)
      findRow.append(field)
      for (const sel of ['[name=next]', '[name=prev]', '[name=select]', '[name=close]']) {
        const el = panel.querySelector(`button${sel}`)
        if (el) findRow.append(el)
      }

      if (replace) {
        const replaceRow = doc.createElement('div')
        replaceRow.className = 'cm-search-row cm-search-row-replace'
        findRow.after(replaceRow)
        replaceRow.append(replace)
        for (const sel of ['[name=replace]', '[name=replaceAll]']) {
          const el = panel.querySelector(`button${sel}`)
          if (el) replaceRow.append(el)
        }
      }

      panel.querySelectorAll('br').forEach((br) => br.remove())

      const toggle = doc.createElement('button')
      toggle.type = 'button'
      toggle.className = 'cm-replace-toggle'
      toggle.textContent = '▶'
      toggle.setAttribute('aria-expanded', 'false')
      toggle.addEventListener('click', (e) => {
        e.preventDefault()
        const view = editorViewOf(panel)
        if (!view) return
        view.dispatch({ effects: setReplaceCollapsed.of(!isReplaceCollapsed(view.state)) })
      })
      panel.prepend(toggle)
    }
  }
)

/** 패널 DOM에서 소속 EditorView를 되찾는다 — 토글 클릭 핸들러가 dispatch하려면 필요하다. */
const editorViewOf = (panel: HTMLElement): EditorView | null => {
  const root = panel.closest('.cm-editor')
  return root ? EditorView.findFromDOM(root as HTMLElement) : null
}

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
    // 에디터를 기준 박스로 삼는다 — 이게 없으면 absolute 패널이 뷰포트 기준으로 날아간다.
    '&': { position: 'relative' },

    // ── 패널을 문서 흐름에서 빼내 우측 상단에 띄운다 ──────────────
    // CM 기본값은 에디터 flex 컨테이너의 형제로 삽입되는 인라인 도킹이라
    // 패널이 뜨는 만큼 본문이 아래로 밀린다(코드 섹션에서 162→197px 실측).
    // absolute로 빼면 콘텐츠 높이 계산에서 제외되어 에디터 높이가 불변이 된다.
    '.cm-panels': {
      background: 'transparent', color: 'var(--text-secondary)', border: 'none',
    },
    '.cm-panels.cm-panels-top': {
      position: 'absolute', top: '6px', right: '8px', left: 'auto',
      width: 'auto', maxWidth: 'calc(100% - 16px)',
      zIndex: '6', borderBottom: 'none',
    },
    '.cm-panel.cm-search': {
      display: 'grid', gridTemplateColumns: 'auto 1fr', alignItems: 'center',
      gap: '4px 6px', padding: '5px 7px', fontSize: '12px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)', borderRadius: '6px',
      boxShadow: '0 6px 18px var(--bg-overlay)',
      // 줄바꿈 금지 — 기본값(flex-wrap)이 좁은 폭에서 패널을 2~3행으로 부풀렸다.
      whiteSpace: 'nowrap',
    },
    // 주입된 행 wrapper — 찾기 행 / 바꾸기 행
    '.cm-panel.cm-search .cm-search-row': {
      gridColumn: '2', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'nowrap',
    },

    // ── 검색 필드 박스 — 입력창과 옵션 토글을 한 덩어리로 (주입된 wrapper) ──
    '.cm-panel.cm-search .cm-search-field': {
      display: 'flex', alignItems: 'center', gap: '2px',
      background: 'var(--bg-input)', border: '1px solid var(--border-default)',
      borderRadius: '4px', padding: '1px 3px 1px 6px', minWidth: '210px',
    },
    '.cm-panel.cm-search .cm-search-field:focus-within': { borderColor: 'var(--border-accent)' },
    '.cm-panel.cm-search .cm-search-field .cm-textfield': {
      background: 'transparent', border: 'none', padding: '2px 0',
      color: 'var(--text-primary)', flex: '1', minWidth: '0', outline: 'none',
    },

    // 옵션 토글 — 텍스트는 스크린리더용으로 남기고 시각적으로만 기호로 축약한다.
    '.cm-panel.cm-search .cm-search-field label': {
      position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: '20px', height: '18px', borderRadius: '3px', cursor: 'pointer',
      overflow: 'hidden', textIndent: '-999px', color: 'var(--text-tertiary)',
      border: '1px solid transparent', flex: 'none',
    },
    '.cm-panel.cm-search .cm-search-field label:hover': { background: 'var(--bg-input-hover)' },
    '.cm-panel.cm-search .cm-search-field label input': {
      position: 'absolute', opacity: '0', width: '100%', height: '100%', margin: '0', cursor: 'pointer',
    },
    '.cm-panel.cm-search .cm-search-field label::after': {
      position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
      textIndent: '0', fontSize: '10px', fontWeight: '600', letterSpacing: '0',
    },
    // 주입 시 붙인 data 속성으로 선택한다 — `:has()`를 쓰면 Safari<15.4·Firefox<121에서
    // 축약이 통째로 무효가 되어 원문 라벨이 노출된다.
    '.cm-panel.cm-search .cm-search-field label[data-dn-opt="case"]': { order: '1' },
    '.cm-panel.cm-search .cm-search-field label[data-dn-opt="word"]': { order: '2' },
    '.cm-panel.cm-search .cm-search-field label[data-dn-opt="re"]': { order: '3' },
    '.cm-panel.cm-search .cm-search-field label[data-dn-opt="case"]::after': { content: '"Aa"' },
    '.cm-panel.cm-search .cm-search-field label[data-dn-opt="word"]::after': { content: '"ab|"' },
    '.cm-panel.cm-search .cm-search-field label[data-dn-opt="re"]::after': { content: '".*"' },
    // 체크 상태만 `:has()`를 쓴다 — 미지원 브라우저에서도 체크박스가 안 보일 뿐
    // 검색 옵션 자체는 정상 동작한다(축약과 달리 레이아웃을 깨지 않는다).
    '.cm-panel.cm-search .cm-search-field label:has(:checked)': {
      color: 'var(--text-active)', borderColor: 'var(--border-accent)', background: 'var(--bg-accent-hover)',
    },

    // ── 펼침 토글 (주입된 버튼) — 전체 행에 걸쳐 좌측 세로 배치 ──
    '.cm-panel.cm-search .cm-replace-toggle': {
      gridColumn: '1', gridRow: '1 / -1', alignSelf: 'center',
      background: 'transparent', backgroundImage: 'none', border: 'none',
      color: 'var(--text-tertiary)', cursor: 'pointer',
      fontSize: '9px', lineHeight: '1', padding: '4px 2px', borderRadius: '3px',
    },
    '.cm-panel.cm-search .cm-replace-toggle:hover': { color: 'var(--text-primary)', background: 'var(--bg-input-hover)' },
    '.cm-panel.cm-search .cm-replace-toggle[aria-expanded="true"]': { color: 'var(--text-active)' },

    // ── 버튼·바꾸기 입력 ──
    '.cm-panel.cm-search .cm-button': {
      background: 'var(--bg-input)', backgroundImage: 'none', color: 'var(--text-secondary)',
      border: '1px solid var(--border-default)', borderRadius: '4px',
      padding: '2px 7px', cursor: 'pointer', flex: 'none',
    },
    '.cm-panel.cm-search .cm-button:hover': { background: 'var(--bg-input-hover)', color: 'var(--text-primary)' },
    '.cm-panel.cm-search input[name=replace]': {
      background: 'var(--bg-input)', color: 'var(--text-primary)',
      border: '1px solid var(--border-default)', borderRadius: '4px', padding: '3px 6px',
      flex: '1', minWidth: '120px',
    },
    '.cm-panel.cm-search input[name=replace]:focus': { outline: 'none', borderColor: 'var(--border-accent)' },
    // CM baseTheme는 close를 패널 우상단에 absolute로 띄운다 — 행 흐름으로 되돌려야 세로 중앙에 선다.
    '.cm-panel.cm-search [name=close]': {
      position: 'relative', top: '0', right: 'auto',
      background: 'transparent', backgroundImage: 'none', border: 'none',
      color: 'var(--text-tertiary)', padding: '0 2px', cursor: 'pointer', flex: 'none',
      fontSize: '15px', lineHeight: '1', marginLeft: '2px',
    },
    '.cm-panel.cm-search [name=close]:hover': { color: 'var(--text-primary)' },

    '.cm-searchMatch': { backgroundColor: 'var(--bg-search-match)' },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--bg-search-match-active)', outline: '1px solid var(--border-accent)',
    },

    // 바꾸기 행 접기 (Ctrl+F=접힘 / ▶ 토글·Ctrl+H=펼침) — 행 단위로 숨긴다
    '&.cm-replace-collapsed .cm-panel.cm-search .cm-search-row-replace': { display: 'none' },
  }),
  searchPanelDecor,
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
