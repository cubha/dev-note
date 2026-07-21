import { useRef, useEffect, useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { Copy } from 'lucide-react'
import {
  EditorView, keymap as cmKeymap, lineNumbers,
  highlightActiveLine, placeholder as cmPlaceholder,
} from '@codemirror/view'
import { EditorState as CMState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, insertTab, indentLess } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import type { CodeSection } from '../../../core/types'
import { copyToClipboard } from '../../../shared/utils/clipboard'
import { useResizableHeight } from '../../../shared/hooks/useResizableHeight'
import { effectiveKeybindingsAtom } from '../../../store/atoms'
import { buildEditorKeymap } from '../../../shared/utils/editorKeymap'

import { defaultCommentTokens, commentHighlight } from '../../../shared/utils/editorExtensions'

const LANGUAGES = [
  'text', 'bash', 'sql', 'json',
  'yaml', 'python', 'javascript', 'typescript', 'html', 'css', 'dockerfile',
]


interface CodeSectionViewProps {
  section: CodeSection
  onChange: (updated: CodeSection) => void
}

export const CodeSectionView = ({ section, onChange }: CodeSectionViewProps) => {
  return (
    <div className="space-y-2">
      {/* 언어 선택 + 복사 */}
      <div className="flex items-center gap-2">
        <select
          value={section.language}
          onChange={(e) => onChange({ ...section, language: e.target.value })}
          className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] border border-[var(--border-default)] cursor-pointer"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void copyToClipboard(section.code, '코드')}
          className="subtle-icon-btn"
        >
          <Copy size={12} />
        </button>
      </div>

      {/* CodeMirror 에디터 (드래그 리사이즈) */}
      <ResizableMiniCodeEditor
        value={section.code}
        language={section.language}
        onChange={(code) => onChange({ ...section, code })}
      />
    </div>
  )
}

// ── 리사이즈 가능한 CodeMirror 래퍼 ──────────────────────────

const ResizableMiniCodeEditor = ({ value, language, onChange }: {
  value: string
  language: string
  onChange: (val: string) => void
}) => {
  const { height, handleDragStart } = useResizableHeight(60, 160)

  return (
    <div className="flex flex-col">
      <MiniCodeEditor
        value={value}
        language={language}
        onChange={onChange}
        height={height}
      />
      {/* 드래그 리사이즈 핸들 */}
      <div
        role="separator"
        aria-label="높이 조절"
        onMouseDown={handleDragStart}
        className="group flex items-center justify-center h-2 mt-0.5 rounded-b cursor-row-resize select-none"
      >
        <div className="w-8 h-0.5 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--text-tertiary)] transition-colors" />
      </div>
    </div>
  )
}

// ── 경량 CodeMirror 에디터 ────────────────────

const MiniCodeEditor = ({ value, language, onChange, height }: {
  value: string
  language: string
  onChange: (val: string) => void
  height: number
}) => {
  const effectiveKeys = useAtomValue(effectiveKeybindingsAtom)
  const customKeymap = useMemo(() => buildEditorKeymap(effectiveKeys), [effectiveKeys])
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const isProgrammaticRef = useRef(false)
  const langCompartment = useRef(new Compartment())
  const editorKeymapCompartment = useRef(new Compartment())

  useEffect(() => { onChangeRef.current = onChange })

  // 마운트
  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: CMState.create({
        doc: value,
        extensions: [
          history(),
          lineNumbers(),
          // drawSelection 미사용 — native ::selection으로 caret 행 선택표시 보장(D2, index.css)
          highlightActiveLine(),
          bracketMatching(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          defaultCommentTokens,
          editorKeymapCompartment.current.of(cmKeymap.of(customKeymap)),
          // Tab: 커서 위치에 삽입(선택영역 있으면 줄 들여쓰기), Shift+Tab: 내어쓰기
          cmKeymap.of([...defaultKeymap, ...historyKeymap, { key: 'Tab', run: insertTab, shift: indentLess }]),
          langCompartment.current.of([]),
          cmPlaceholder('코드를 입력하세요...'),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isProgrammaticRef.current) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
          EditorView.theme({
            '&': { background: 'var(--bg-input)', color: 'var(--text-editor)', borderRadius: '6px', border: '1px solid var(--border-default)' },
            '&.cm-focused': { outline: 'none', borderColor: 'var(--border-accent)' },
            '.cm-scroller': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, "Courier New", monospace',
              fontSize: '12px',
              lineHeight: '1.6',
              paddingTop: '8px',
              paddingBottom: '8px',
              overflow: 'auto',
            },
            // 좌우 padding은 scroller가 아닌 content에 둔다 — scroller에 두면 sticky gutter(좌측 고정) 안쪽에
            // 빈 여백이 생기고 그 여백이 가로 스크롤 범위에 포함되어 텍스트가 겹쳐 보인다.
            '.cm-content': { caretColor: 'var(--accent)', minHeight: '60px', paddingLeft: '4px', paddingRight: '4px' },
            '.cm-cursor': { borderLeftColor: 'var(--accent)' },
            '.cm-placeholder': { color: 'var(--text-placeholder)' },
            // 거터 배경 불투명(에디터 입력 surface)으로 가로스크롤 코드 겹침 차단(D1)
            '.cm-gutters': { background: 'var(--bg-input)', border: 'none', paddingRight: '4px', color: 'var(--text-placeholder)' },
            '.cm-lineNumbers .cm-gutterElement': { color: 'var(--text-placeholder)', minWidth: '1.5rem', fontSize: '10px' },
            '.cm-activeLine': { background: 'var(--bg-surface-hover)' },
            '.cm-activeLineGutter': { background: 'var(--bg-input)' },
            '.cm-comment-highlight': { color: 'var(--text-tertiary)', fontStyle: 'italic' },
          }),
          commentHighlight,
        ],
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 외부 value 변경
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      isProgrammaticRef.current = true
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
      isProgrammaticRef.current = false
    }
  }, [value])

  // 에디터 커스텀 키맵 변경
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editorKeymapCompartment.current.reconfigure(
        cmKeymap.of(customKeymap),
      ),
    })
  }, [customKeymap])

  // language 변경 시 동적 로드
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    void (async () => {
      try {
        let langExt
        switch (language) {
          case 'json':
            langExt = (await import('@codemirror/lang-json')).json()
            break
          case 'sql':
            langExt = (await import('@codemirror/lang-sql')).sql()
            break
          case 'yaml':
            langExt = (await import('@codemirror/lang-yaml')).yaml()
            break
          case 'python':
            langExt = (await import('@codemirror/lang-python')).python()
            break
          case 'javascript':
            langExt = (await import('@codemirror/lang-javascript')).javascript()
            break
          case 'typescript':
            langExt = (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
            break
          case 'html':
            langExt = (await import('@codemirror/lang-html')).html()
            break
          case 'css':
            langExt = (await import('@codemirror/lang-css')).css()
            break
          default:
            langExt = null
        }

        view.dispatch({
          effects: langCompartment.current.reconfigure(langExt ? [langExt] : []),
        })
      } catch {
        // 언어 모드 로드 실패 시 무시 (plain text로 동작)
      }
    })()
  }, [language])

  // height 변경 시 스크롤러 높이 업데이트
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const scroller = view.scrollDOM
    if (scroller) {
      scroller.style.height = `${height}px`
    }
  }, [height])

  return (
    <div ref={containerRef} />
  )
}
