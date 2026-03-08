import { useRef, useEffect } from 'react'
import { Copy } from 'lucide-react'
import {
  EditorView, keymap as cmKeymap, lineNumbers, drawSelection,
  highlightActiveLine, placeholder as cmPlaceholder,
} from '@codemirror/view'
import { EditorState as CMState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import type { CodeSection } from '../../../core/types'
import { copyToClipboard } from '../../../shared/utils/clipboard'

const LANGUAGES = [
  'text', 'bash', 'sql', 'json',
]

interface CodeSectionViewProps {
  section: CodeSection
  onChange: (updated: CodeSection) => void
}

export function CodeSectionView({ section, onChange }: CodeSectionViewProps) {
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
          className="p-1 text-[var(--text-placeholder)] hover:text-[var(--text-tertiary)] cursor-pointer bg-transparent border-none"
        >
          <Copy size={12} />
        </button>
      </div>

      {/* CodeMirror 에디터 */}
      <MiniCodeEditor
        value={section.code}
        language={section.language}
        onChange={(code) => onChange({ ...section, code })}
      />
    </div>
  )
}

// ── 경량 CodeMirror 에디터 ────────────────────

function MiniCodeEditor({ value, language, onChange }: {
  value: string
  language: string
  onChange: (val: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const isProgrammaticRef = useRef(false)
  const langCompartment = useRef(new Compartment())

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
          drawSelection(),
          highlightActiveLine(),
          bracketMatching(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          cmKeymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
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
              padding: '8px 4px',
              overflow: 'auto',
              maxHeight: '300px',
            },
            '.cm-content': { caretColor: 'var(--accent)', minHeight: '60px' },
            '.cm-cursor': { borderLeftColor: 'var(--accent)' },
            '.cm-placeholder': { color: 'var(--text-placeholder)' },
            '.cm-gutters': { background: 'transparent', border: 'none', paddingRight: '4px', color: 'var(--text-placeholder)' },
            '.cm-lineNumbers .cm-gutterElement': { color: 'var(--text-placeholder)', minWidth: '1.5rem', fontSize: '10px' },
            '.cm-activeLine': { background: 'var(--bg-surface-hover)' },
            '.cm-activeLineGutter': { background: 'transparent' },
            '.cm-selectionBackground': { background: 'var(--accent-glow) !important' },
            '&.cm-focused .cm-selectionBackground': { background: 'rgba(59,130,246,0.25) !important' },
          }),
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

  // language 변경 시 동적 로드 (성능: 필요할 때만)
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

  return (
    <div ref={containerRef} />
  )
}
