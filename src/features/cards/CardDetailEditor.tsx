import { useState, useEffect, useCallback, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Terminal, Database, Globe, FileText, Puzzle, ChevronDown,
} from 'lucide-react'
import {
  EditorView, keymap as cmKeymap, lineNumbers, drawSelection,
  highlightActiveLine, placeholder as cmPlaceholder,
} from '@codemirror/view'
import { EditorState as CMState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { db } from '../../core/db'
import type { ItemType } from '../../core/db'
import { FIELD_SCHEMAS, TYPE_META } from '../../core/types'
import type { StructuredContent } from '../../core/types'
import { parseContent } from '../../core/content'
import { safeEncrypt, safeDecrypt } from '../../core/crypto'
import {
  cryptoKeyAtom, activeTabAtom, dirtyItemsAtom,
} from '../../store/atoms'
import { toast } from 'sonner'

const ICON_MAP: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  custom: Puzzle,
}

const ALL_TYPES: ItemType[] = ['server', 'db', 'api', 'note', 'custom']

// ── 기존 StructuredContent → 평문 텍스트 변환 ────────

function structuredToText(content: StructuredContent): string {
  return content.fields
    .filter(f => f.value !== '')
    .map(f => `${f.label}: ${f.value}`)
    .join('\n')
}

// ── 타입별 placeholder (비어있을 때 표시할 필드 힌트) ──

function buildPlaceholderEl(type: ItemType): HTMLElement {
  const schemas = FIELD_SCHEMAS[type]
  const el = document.createElement('div')
  el.style.cssText = 'white-space: pre; pointer-events: none;'

  const isFreeform = schemas.length === 1 && schemas[0].key === 'content'
  if (isFreeform) {
    el.textContent = schemas[0].placeholder ?? '자유롭게 입력하세요...'
  } else {
    el.textContent = schemas.map(s => `${s.label}: `).join('\n')
  }
  return el
}

// ── Main component ──────────────────────────────────

export function CardDetailEditor() {
  const cryptoKey = useAtomValue(cryptoKeyAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)

  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType>('server')
  const [tags, setTags] = useState('')
  const [text, setText] = useState('')
  const [dirty, setDirty] = useState(false)
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false)
  const typeDropdownRef = useRef<HTMLDivElement>(null)
  const initialLoadRef = useRef(false)

  const item = useLiveQuery(
    () => activeTab ? db.items.get(activeTab) : undefined,
    [activeTab],
  )

  // 아이템 로드
  useEffect(() => {
    if (!item) return
    initialLoadRef.current = true
    setTitle(item.title)
    setType(item.type)
    setTags(item.tags.join(', '))
    setDirty(false)

    void (async () => {
      const decrypted = await safeDecrypt(cryptoKey, item.encryptedContent, item.iv)
      const content = parseContent(decrypted)
      if (content.format === 'structured') {
        setText(structuredToText(content))
      } else {
        setText(content.text)
      }
      initialLoadRef.current = false
    })()
  }, [item, cryptoKey])

  // dirty 상태 동기화
  useEffect(() => {
    if (activeTab === null) return
    setDirtyItems((prev) => {
      const next = new Set(prev)
      if (dirty) next.add(activeTab)
      else next.delete(activeTab)
      return next
    })
  }, [dirty, activeTab, setDirtyItems])

  // 타입 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!typeDropdownOpen) return
    const close = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false)
      }
    }
    document.addEventListener('click', close, { capture: true })
    return () => document.removeEventListener('click', close, { capture: true })
  }, [typeDropdownOpen])

  const markDirty = useCallback(() => {
    if (!initialLoadRef.current) setDirty(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!item) return
    try {
      const { encryptedContent, iv } = await safeEncrypt(cryptoKey, text)
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean)
      await db.items.update(item.id, {
        title,
        type,
        tags: parsedTags,
        encryptedContent,
        iv,
        updatedAt: Date.now(),
      })
      setDirty(false)
      toast.success('저장됨', { duration: 1500 })
    } catch {
      // ignore
    }
  }, [item, text, title, type, tags, cryptoKey])

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  if (!item) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--text-tertiary)]">로딩 중...</p>
      </div>
    )
  }

  const meta = TYPE_META[type]
  const IconComponent = ICON_MAP[type]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Meta (제목 / 타입 / 태그) ────── */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-4 space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); markDirty() }}
          placeholder="제목 없음"
          className="w-full bg-transparent text-xl font-bold text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:outline-none border-none p-0"
        />

        <div className="flex items-center gap-3">
          {/* Type selector */}
          <div className="relative" ref={typeDropdownRef}>
            <button
              type="button"
              onClick={() => setTypeDropdownOpen(prev => !prev)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border border-[var(--border-default)]"
              style={{
                background: `var(--badge-${meta.colorKey}-bg)`,
                color: `var(--badge-${meta.colorKey}-text)`,
              }}
            >
              <IconComponent size={14} />
              {meta.label}
              <ChevronDown size={12} />
            </button>

            {typeDropdownOpen && (
              <div className="absolute left-0 top-9 z-50 w-44 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg">
                {ALL_TYPES.map((t) => {
                  const m = TYPE_META[t]
                  const Icon = ICON_MAP[t]
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setType(t); setTypeDropdownOpen(false); markDirty() }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors cursor-pointer bg-transparent border-none ${
                        type === t
                          ? 'text-[var(--text-primary)] bg-[var(--bg-surface-hover)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded"
                        style={{
                          background: `var(--badge-${m.colorKey}-bg)`,
                          color: `var(--badge-${m.colorKey}-text)`,
                        }}
                      >
                        <Icon size={12} />
                      </div>
                      {m.label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tags */}
          <input
            type="text"
            value={tags}
            onChange={(e) => { setTags(e.target.value); markDirty() }}
            placeholder="태그 (쉼표 구분)"
            className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* ── CodeMirror editor ────────────── */}
      <NoteEditor
        value={text}
        type={type}
        onChange={(val) => { setText(val); markDirty() }}
      />
    </div>
  )
}

// ── CodeMirror 에디터 ────────────────────────────────

function NoteEditor({ value, type, onChange }: {
  value: string
  type: ItemType
  onChange: (val: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const placeholderCompartment = useRef(new Compartment())

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
          cmKeymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          phComp.of(cmPlaceholder(buildPlaceholderEl(type))),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
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
  }, []) // 마운트 시 한 번만

  // type 변경 → placeholder 교체
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: placeholderCompartment.current.reconfigure(
        cmPlaceholder(buildPlaceholderEl(type)),
      ),
    })
  }, [type])

  // 외부 value 변경 (아이템 전환) 시 에디터 내용 교체
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden"
    />
  )
}
