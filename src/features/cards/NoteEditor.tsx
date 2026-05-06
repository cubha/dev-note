// src/features/cards/NoteEditor.tsx
//
// CodeMirror 6 기반 메모/마크다운 에디터 컴포넌트

import { useRef, useMemo, useEffect } from 'react'
import { useAtomValue } from 'jotai'
import {
  EditorView, keymap as cmKeymap, lineNumbers, drawSelection,
  highlightActiveLine, placeholder as cmPlaceholder,
} from '@codemirror/view'
import { EditorState as CMState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { effectiveKeybindingsAtom } from '../../store/atoms'
import { buildEditorKeymap } from '../../shared/utils/editorKeymap'
import { defaultCommentTokens, commentHighlight } from '../../shared/utils/editorExtensions'

interface NoteEditorProps {
  value: string
  placeholderText: string
  onChange: (val: string) => void
  onScroll?: (ratio: number) => void
}

export const NoteEditor = ({ value, placeholderText, onChange, onScroll }: NoteEditorProps) => {
  const effectiveKeys = useAtomValue(effectiveKeybindingsAtom)
  const customKeymap = useMemo(() => buildEditorKeymap(effectiveKeys), [effectiveKeys])
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onScrollRef = useRef(onScroll)
  const isProgrammaticRef = useRef(false)
  const placeholderCompartment = useRef(new Compartment())
  const editorKeymapCompartment = useRef(new Compartment())

  useEffect(() => {
    onChangeRef.current = onChange
    onScrollRef.current = onScroll
  })

  // 마운트
  useEffect(() => {
    if (!containerRef.current) return

    const phComp = placeholderCompartment.current
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
          defaultCommentTokens,
          editorKeymapCompartment.current.of(cmKeymap.of(customKeymap)),
          cmKeymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          phComp.of(cmPlaceholder(placeholderText)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isProgrammaticRef.current) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
          EditorView.domEventHandlers({
            scroll: (_e, view) => {
              const { scrollTop, scrollHeight, clientHeight } = view.scrollDOM
              const max = scrollHeight - clientHeight
              if (max > 0) onScrollRef.current?.(scrollTop / max)
            },
          }),
          EditorView.theme({
            '&': { height: '100%', background: 'transparent', color: 'var(--text-editor)' },
            '&.cm-focused': { outline: 'none' },
            '.cm-editor': { height: '100%' },
            '.cm-scroller': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, "Courier New", monospace',
              fontSize: '13px',
              lineHeight: '1.7',
              padding: '20px 24px',
              overflow: 'auto',
            },
            '.cm-content': { minHeight: '100%', caretColor: 'var(--accent)' },
            '.cm-cursor': { borderLeftColor: 'var(--accent)' },
            '.cm-placeholder': { color: 'var(--text-placeholder)' },
            '.cm-gutters': { background: 'transparent', border: 'none', paddingRight: '8px', color: 'var(--text-placeholder)' },
            '.cm-lineNumbers .cm-gutterElement': { color: 'var(--text-placeholder)', minWidth: '2rem' },
            '.cm-activeLine': { background: 'var(--bg-surface-hover)' },
            '.cm-activeLineGutter': { background: 'transparent' },
            '.cm-selectionBackground': { background: 'var(--accent-glow) !important' },
            '&.cm-focused .cm-selectionBackground': { background: 'rgba(59,130,246,0.25) !important' },
            '.cm-matchingBracket': { color: 'var(--text-primary)', outline: '1px solid var(--border-accent)' },
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
  }, []) // 마운트 시 한 번만

  // placeholder 변경
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: placeholderCompartment.current.reconfigure(cmPlaceholder(placeholderText)),
    })
  }, [placeholderText])

  // 에디터 커스텀 키맵 변경
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: editorKeymapCompartment.current.reconfigure(cmKeymap.of(customKeymap)),
    })
  }, [customKeymap])

  // 외부 value 변경 시 에디터 내용 교체
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      isProgrammaticRef.current = true
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
      isProgrammaticRef.current = false
    }
  }, [value])

  return <div ref={containerRef} className="flex-1 overflow-hidden" />
}
