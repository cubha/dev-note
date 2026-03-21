import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { formatForDisplay } from '@tanstack/hotkeys'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronDown, Download, Eye, EyeOff, Save,
} from 'lucide-react'
import {
  EditorView, keymap as cmKeymap, lineNumbers, drawSelection,
  highlightActiveLine, placeholder as cmPlaceholder,
  MatchDecorator, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate,
} from '@codemirror/view'
import { EditorState as CMState, Compartment, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { db } from '../../core/db'
import type { ItemType } from '../../core/db'
import { FIELD_SCHEMAS, TYPE_META } from '../../core/types'
import type { CardField, StructuredContent } from '../../core/types'
import { parseContent, serializeContent } from '../../core/content'
import {
  activeTabAtom, dirtyItemsAtom, effectiveKeybindingsAtom,
} from '../../store/atoms'
import { buildEditorKeymap } from '../../shared/utils/editorKeymap'
import { toast } from 'sonner'
import { StructuredFieldForm } from './StructuredFieldInput'
import { ICON_MAP } from '../../shared/constants'
import { useClickOutside } from '../../shared/hooks/useClickOutside'
import { hasFormFields, hasEditorField, getEditorFieldKey, getEditorFieldSchema } from './fieldHelpers'
import { DocumentEditor } from './DocumentEditor'
import type { DocumentEditorHandle } from './DocumentEditor'

const ALL_TYPES: ItemType[] = ['server', 'db', 'api', 'note', 'document']

// ── Main component ──────────────────────────────────

export function CardDetailEditor() {
  const activeTab = useAtomValue(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const effectiveKeys = useAtomValue(effectiveKeybindingsAtom)
  const saveKeyLabel = formatForDisplay(effectiveKeys['card.save'])

  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType>('server')
  const [tags, setTags] = useState('')
  const [fields, setFields] = useState<CardField[]>([])
  const [editorText, setEditorText] = useState('')
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false)
  const typeDropdownRef = useRef<HTMLDivElement>(null)
  const docEditorRef = useRef<DocumentEditorHandle>(null)
  const [docDirty, setDocDirty] = useState(false)

  // 원본 스냅샷 — 값 비교 기반 dirty 판단
  interface OriginalSnapshot {
    title: string; type: ItemType; tags: string;
    fields: string; editorText: string
  }
  const [original, setOriginal] = useState<OriginalSnapshot | null>(null)

  const item = useLiveQuery(
    () => activeTab ? db.items.get(activeTab) : undefined,
    [activeTab],
  )

  // activeTab 변경 시 즉시 상태 초기화 — 이전 카드 정보 잔류 방지
  useEffect(() => {
    setTitle('')
    setType('server')
    setTags('')
    setFields([])
    setEditorText('')
    setOriginal(null)
  }, [activeTab])

  // 아이템 로드 (useLiveQuery 완료 후)
  useEffect(() => {
    if (!item) return
    const tagsStr = item.tags.join(', ')
    setTitle(item.title)
    setType(item.type)
    setTags(tagsStr)

    const content = parseContent(item.content)
    const editorKey = getEditorFieldKey(item.type)

    let loadedFields: CardField[]
    let loadedEditorText: string

    if (content.format === 'structured') {
      const fieldMap = new Map(content.fields.map(f => [f.key, f.value]))
      const schemas = FIELD_SCHEMAS[item.type]
      loadedFields = schemas.map(s => ({
        key: s.key, label: s.label, value: fieldMap.get(s.key) ?? '', type: s.type,
      }))
      loadedEditorText = editorKey ? (fieldMap.get(editorKey) ?? '') : ''
    } else if (content.format === 'legacy') {
      const schemas = FIELD_SCHEMAS[item.type]
      loadedFields = schemas.map(s => ({ key: s.key, label: s.label, value: '', type: s.type }))
      loadedEditorText = content.text
    } else {
      // HybridContent — document 타입은 DocumentEditor에서 처리
      loadedFields = []
      loadedEditorText = ''
    }

    setFields(loadedFields)
    setEditorText(loadedEditorText)

    // 원본 스냅샷 저장 (dirty 비교 기준)
    setOriginal({
      title: item.title,
      type: item.type,
      tags: tagsStr,
      fields: JSON.stringify(loadedFields.map(f => [f.key, f.value])),
      editorText: loadedEditorText,
    })
  }, [item])

  // dirty 상태 — 원본 스냅샷과 현재 값 비교
  const dirty = (() => {
    if (!original) return false
    const o = original
    if (o.title !== title || o.type !== type || o.tags !== tags) return true
    // document 타입은 sections dirty를 DocumentEditor에서 관리
    if (type === 'document') return docDirty
    if (o.editorText !== editorText) return true
    const currentFieldsStr = JSON.stringify(fields.map(f => [f.key, f.value]))
    return o.fields !== currentFieldsStr
  })()

  // dirty 상태를 dirtyItemsAtom에 동기화
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
  const closeTypeDropdown = useCallback(() => setTypeDropdownOpen(false), [])
  useClickOutside(typeDropdownRef, typeDropdownOpen, closeTypeDropdown)

  // 정형 필드 값 변경
  const handleFieldChange = useCallback((key: string, value: string) => {
    setFields(prev => prev.map(f => f.key === key ? { ...f, value } : f))
  }, [])

  // 에디터(비고/내용) 텍스트 변경
  const handleEditorChange = useCallback((val: string) => {
    setEditorText(val)
  }, [])

  // 타입 변경 시 필드 리빌드 (기존 값 보존)
  const handleTypeChange = useCallback((newType: ItemType) => {
    setType(newType)
    setTypeDropdownOpen(false)

    const schemas = FIELD_SCHEMAS[newType]
    setFields(prev => {
      const prevMap = new Map(prev.map(f => [f.key, f.value]))
      return schemas.map(s => ({
        key: s.key, label: s.label, value: prevMap.get(s.key) ?? '', type: s.type,
      }))
    })
  }, [])

  // 저장: 필드 + 에디터 → StructuredContent → JSON
  const handleSave = useCallback(async () => {
    if (!item) return
    try {
      const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean)

      if (type === 'document') {
        // document 타입: title/tags 저장 + DocumentEditor content 저장 통합
        await db.items.update(item.id, {
          title, type, tags: parsedTags, updatedAt: Date.now(),
        })
        setOriginal(prev => prev ? { ...prev, title, type, tags } : null)
        if (docEditorRef.current) {
          await docEditorRef.current.save()
        }
        return
      }

      const schemas = FIELD_SCHEMAS[type]
      const editorKey = getEditorFieldKey(type)

      const allFields: CardField[] = schemas.map(schema => {
        if (editorKey && schema.key === editorKey) {
          return { key: schema.key, label: schema.label, value: editorText, type: schema.type }
        }
        const existing = fields.find(f => f.key === schema.key)
        return existing ?? { key: schema.key, label: schema.label, value: '', type: schema.type }
      })

      const structured: StructuredContent = { format: 'structured', fields: allFields }
      const content = serializeContent(structured)

      await db.items.update(item.id, {
        title, type, tags: parsedTags,
        content,
        updatedAt: Date.now(),
      })
      // 원본 스냅샷 갱신 → dirty가 자동으로 false 됨
      setOriginal({
        title, type, tags,
        fields: JSON.stringify(fields.map(f => [f.key, f.value])),
        editorText,
      })
      toast.success('저장됨', { duration: 1500 })
    } catch (err) {
      toast.error(`저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, { duration: 3000 })
    }
  }, [item, fields, editorText, title, type, tags])

  // .md 다운로드 (Custom 타입)
  const handleDownloadMd = useCallback(() => {
    const filename = `${title || 'note'}.md`
    const blob = new Blob([editorText], { type: 'text/markdown;charset=utf-8' })

    if ('showSaveFilePicker' in window) {
      type FSAAWindow = Window & {
        showSaveFilePicker: (opts: unknown) => Promise<{
          createWritable: () => Promise<{
            write: (b: Blob) => Promise<void>
            close: () => Promise<void>
          }>
        }>
      }
      void (async () => {
        try {
          const handle = await (window as FSAAWindow).showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          toast.success(`${filename} 저장됨`, { duration: 2000 })
        } catch {
          // 취소 시 무시
        }
      })()
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`${filename} 다운로드됨`, { duration: 2000 })
    }
  }, [title, editorText])

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // 로딩 중
  if (item === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 rounded bg-[var(--accent)] animate-pulse" />
          <p className="text-xs text-[var(--text-tertiary)]">불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (item === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--text-tertiary)]">카드를 찾을 수 없습니다</p>
      </div>
    )
  }

  const meta = TYPE_META[type]
  const IconComponent = ICON_MAP[type]
  const showForm = hasFormFields(type)
  const showEditor = hasEditorField(type)
  const editorSchema = getEditorFieldSchema(type)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Meta (제목 / 타입 / 태그) ────── */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-4 space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
                      onClick={() => handleTypeChange(t)}
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
            onChange={(e) => setTags(e.target.value)}
            placeholder="태그 (쉼표 구분)"
            className="flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
          />

          {/* .md 다운로드 (Markdown) */}
          {type === 'note' && (
            <button
              type="button"
              onClick={handleDownloadMd}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-hover)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-accent)] transition-colors cursor-pointer shrink-0"
              title=".md 파일로 다운로드"
            >
              <Download size={13} />
              .md
            </button>
          )}

          {/* 저장 버튼 */}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-none shrink-0 ${
              dirty
                ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                : 'bg-[var(--bg-surface-hover)] text-[var(--text-placeholder)] cursor-default'
            }`}
            title={`저장 (${saveKeyLabel})`}
          >
            <Save size={13} />
            저장
          </button>
        </div>
      </div>

      {/* ── Document 타입: DocumentEditor ────── */}
      {type === 'document' ? (
        <DocumentEditor ref={docEditorRef} item={item} onDirtyChange={setDocDirty} />
      ) : (
        <>
          {/* ── 정형 필드 폼 (Server/DB/API) ────── */}
          {showForm && (
            <div className="border-b border-[var(--border-default)] overflow-y-auto max-h-[45vh]">
              <StructuredFieldForm
                fields={fields}
                type={type}
                onFieldChange={handleFieldChange}
              />
            </div>
          )}

          {/* ── 에디터 영역 (비고/내용) ────── */}
          {showEditor && type === 'note' ? (
            <MarkdownEditorWithToggle
              value={editorText}
              onChange={handleEditorChange}
            />
          ) : showEditor ? (
            <div className="flex flex-col flex-1 overflow-hidden">
              {showForm && editorSchema && (
                <div className="px-6 pt-3 pb-0">
                  <span className="text-xs font-medium text-[var(--text-tertiary)]">
                    {editorSchema.label}
                  </span>
                </div>
              )}
              <NoteEditor
                value={editorText}
                placeholderText={editorSchema?.placeholder ?? '자유롭게 입력하세요...'}
                onChange={handleEditorChange}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

// ── Markdown 에디터 (소스 모드 기본 + 미리보기 토글) ──────────

function MarkdownEditorWithToggle({ value, onChange }: {
  value: string
  onChange: (val: string) => void
}) {
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* 토글 바 */}
      <div className="flex items-center justify-end px-4 py-1.5 border-b border-[var(--border-default)] shrink-0">
        <button
          type="button"
          onClick={() => setShowPreview((prev) => !prev)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border-none text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
          title={showPreview ? '미리보기 닫기' : '미리보기 열기'}
        >
          {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
          {showPreview ? '소스' : '미리보기'}
        </button>
      </div>

      {/* 에디터 영역 */}
      {showPreview ? (
        <MarkdownSplitView value={value} onChange={onChange} />
      ) : (
        <NoteEditor
          value={value}
          placeholderText="마크다운으로 자유롭게 입력하세요..."
          onChange={onChange}
        />
      )}
    </div>
  )
}

// ── 마크다운 Split View ────────────────────────────────────────

function MarkdownSplitView({ value, onChange }: {
  value: string
  onChange: (val: string) => void
}) {
  const [html, setHtml] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const result = marked.parse(value) as string
    setHtml(DOMPurify.sanitize(result))
  }, [value])

  const handleEditorScroll = useCallback((ratio: number) => {
    const preview = previewRef.current
    if (!preview) return
    preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight)
  }, [])

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 overflow-hidden border-r border-[var(--border-default)]">
        <NoteEditor
          value={value}
          placeholderText="마크다운으로 입력하세요..."
          onChange={onChange}
          onScroll={handleEditorScroll}
        />
      </div>

      <div ref={previewRef} className="flex-1 overflow-y-auto">
        {html ? (
          <div
            className="md-preview px-6 py-5"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-[var(--text-placeholder)]">마크다운을 입력하면 여기에 미리보기가 표시됩니다</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** 언어 모드 미설정 시 기본 주석 토큰 (// 스타일) */
const defaultCommentTokens: Extension = CMState.languageData.of(
  () => [{ commentTokens: { line: '//' } }]
)

/** // 주석 시각적 하이라이팅 */
const commentDecorator = new MatchDecorator({
  regexp: /\/\/.*/g,
  decoration: Decoration.mark({ class: 'cm-comment-highlight' }),
})
const commentHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = commentDecorator.createDeco(view) }
    update(update: ViewUpdate) { this.decorations = commentDecorator.updateDeco(update, this.decorations) }
  },
  { decorations: v => v.decorations }
)

// ── CodeMirror 에디터 ────────────────────────────────

function NoteEditor({ value, placeholderText, onChange, onScroll }: {
  value: string
  placeholderText: string
  onChange: (val: string) => void
  onScroll?: (ratio: number) => void
}) {
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
      effects: placeholderCompartment.current.reconfigure(
        cmPlaceholder(placeholderText),
      ),
    })
  }, [placeholderText])

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

  // 외부 value 변경 시 에디터 내용 교체
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

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden"
    />
  )
}
