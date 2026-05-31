import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { formatForDisplay } from '@tanstack/hotkeys'
import { useHotkey } from '@tanstack/react-hotkeys'
import type { RegisterableHotkey } from '@tanstack/react-hotkeys'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ChevronDown, Download, Save,
} from 'lucide-react'
import { db } from '../../core/db'
import type { ItemType } from '../../core/db'
import { FIELD_SCHEMAS, TYPE_META } from '../../core/types'
import type { CardField, StructuredContent } from '../../core/types'
import { parseContent, serializeContent, isEncryptedContent, encryptContent, decryptContent } from '../../core/content'
import {
  activeTabAtom, dirtyItemsAtom, effectiveKeybindingsAtom, encryptionKeyAtom, appConfigAtom,
} from '../../store/atoms'
import { toast } from 'sonner'
import { StructuredFieldForm } from './StructuredFieldInput'
import { ICON_MAP } from '../../shared/constants'
import { hasFormFields, hasEditorField, getEditorFieldKey, getEditorFieldSchema } from './fieldHelpers'
import { Dropdown } from '../../shared/components/Dropdown'
import { DocumentEditor } from './DocumentEditor'
import type { DocumentEditorHandle } from './DocumentEditor'
import { NoteEditor } from './NoteEditor'
import { MarkdownEditorWithToggle } from './MarkdownEditorWithToggle'

const ALL_TYPES: ItemType[] = ['server', 'db', 'api', 'note', 'document']

type FSAAWindow = Window & {
  showSaveFilePicker: (opts: unknown) => Promise<{
    createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }>
  }>
}

// ── Main component ──────────────────────────────────

export const CardDetailEditor = () => {
  const activeTab = useAtomValue(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const effectiveKeys = useAtomValue(effectiveKeybindingsAtom)
  const keys = effectiveKeys as Record<string, RegisterableHotkey>
  const saveKeyLabel = formatForDisplay(effectiveKeys['card.save'])
  const encryptionKey = useAtomValue(encryptionKeyAtom)
  const config = useAtomValue(appConfigAtom)
  const encryptionEnabled = config?.encryptionEnabled ?? false

  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType>('server')
  const [tags, setTags] = useState('')
  const [fields, setFields] = useState<CardField[]>([])
  const [editorText, setEditorText] = useState('')
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

  // 아이템 로드 (useLiveQuery 완료 후, 암호화된 content는 복호화 후 파싱)
  useEffect(() => {
    if (!item) return
    const tagsStr = item.tags.join(', ')
    setTitle(item.title)
    setType(item.type)
    setTags(tagsStr)

    void (async () => {
      let rawContent = item.content
      if (isEncryptedContent(rawContent)) {
        if (!encryptionKey) return
        rawContent = await decryptContent(rawContent, encryptionKey)
      }
    const content = parseContent(rawContent)
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
    })()
  }, [item, encryptionKey])

  // dirty 상태 — 원본 스냅샷과 현재 값 비교
  const dirty = useMemo(() => {
    if (!original) return false
    const o = original
    if (o.title !== title || o.type !== type || o.tags !== tags) return true
    // document 타입은 sections dirty를 DocumentEditor에서 관리
    if (type === 'document') return docDirty
    if (o.editorText !== editorText) return true
    const currentFieldsStr = JSON.stringify(fields.map(f => [f.key, f.value]))
    return o.fields !== currentFieldsStr
  }, [original, title, type, tags, docDirty, editorText, fields])

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
      let content = serializeContent(structured)
      if (encryptionEnabled && encryptionKey) {
        content = await encryptContent(content, encryptionKey)
      }

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
  }, [item, fields, editorText, title, type, tags, encryptionKey, encryptionEnabled])

  // .md 다운로드 (Custom 타입)
  const handleDownloadMd = useCallback(() => {
    const filename = `${title || 'note'}.md`
    const blob = new Blob([editorText], { type: 'text/markdown;charset=utf-8' })

    if ('showSaveFilePicker' in window) {
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

  useHotkey(keys['card.save'], (e) => {
    e.preventDefault()
    void handleSave()
  })

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
          <Dropdown
            trigger={
              <button
                type="button"
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
            }
            items={ALL_TYPES.map((t) => {
              const m = TYPE_META[t]
              const Icon = ICON_MAP[t]
              return {
                label: m.label,
                value: t,
                icon: (
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded"
                    style={{
                      background: `var(--badge-${m.colorKey}-bg)`,
                      color: `var(--badge-${m.colorKey}-text)`,
                    }}
                  >
                    <Icon size={12} />
                  </div>
                ),
              }
            })}
            value={type}
            onSelect={(val) => handleTypeChange(val as ItemType)}
          />

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
                  <span className="label-text">
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
