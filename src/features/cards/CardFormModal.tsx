import { useState, useEffect, useCallback } from 'react'
import { useSetAtom } from 'jotai'
import { X, Shield, Link, Terminal, Code, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '../../core/db'
import type { Item, ItemType } from '../../core/db'
import type { CardField, StructuredContent, AnySection, HybridContent, SectionType } from '../../core/types'
import { FIELD_SCHEMAS, TYPE_META } from '../../core/types'
import { parseContent, serializeContent, createEmptyStructuredContent, createEmptyHybridContent, createSection } from '../../core/content'
import { checkDuplicates } from '../../core/duplicate-check'
import { openTabsAtom, activeTabAtom } from '../../store/atoms'
import { openTab } from '../../store/tabHelpers'
import { SmartPastePanel } from './SmartPastePanel'
import type { FieldApplyData, DocumentApplyData } from './SmartPastePanel'
import { ICON_MAP } from '../../shared/constants'

const ITEM_TYPES: ItemType[] = ['server', 'db', 'api', 'note', 'document']

const SECTION_OPTIONS: { type: SectionType; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { type: 'credentials', label: '접속 정보', icon: Shield },
  { type: 'urls', label: 'URL', icon: Link },
  { type: 'env', label: '환경변수', icon: Terminal },
  { type: 'code', label: '코드', icon: Code },
  { type: 'markdown', label: '메모', icon: FileText },
]

interface CardFormModalProps {
  item: Item | null          // null = 새 카드 생성 모드
  folderId: number | null    // 새 카드 생성 시 기본 폴더
  onClose: () => void
}

export function CardFormModal({ item, folderId, onClose }: CardFormModalProps) {
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType>('server')
  const [tags, setTags] = useState('')
  const [fields, setFields] = useState<CardField[]>([])
  const [saving, setSaving] = useState(false)
  const [docSections, setDocSections] = useState<AnySection[] | null>(null)
  const isEditMode = item !== null

  // 편집 모드: 기존 데이터 로드
  useEffect(() => {
    if (!item) {
      setTitle('')
      setType('server')
      setTags('')
      setFields(createEmptyStructuredContent('server').fields)
      return
    }

    setTitle(item.title)
    setType(item.type)
    setTags(item.tags.join(', '))

    const content = parseContent(item.content)
    if (content.format === 'structured') {
      const schemas = FIELD_SCHEMAS[item.type]
      const merged: CardField[] = schemas.map((schema) => {
        const existing = content.fields.find((f) => f.key === schema.key)
        return existing ?? { key: schema.key, label: schema.label, value: '', type: schema.type }
      })
      setFields(merged)
    } else if (content.format === 'legacy') {
      const noteFields = createEmptyStructuredContent(item.type).fields
      if (noteFields.length > 0) {
        noteFields[0] = { ...noteFields[0], value: content.text }
      }
      setFields(noteFields)
    } else {
      // HybridContent — document 편집은 CardDetailEditor에서 처리
      setFields([])
    }
  }, [item])

  // 타입 변경 시 필드 초기화 (생성 모드만)
  const handleTypeChange = (newType: ItemType) => {
    setType(newType)
    if (!isEditMode) {
      setFields(createEmptyStructuredContent(newType).fields)
      setDocSections(null)
    }
  }

  const updateField = (key: string, value: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, value } : f))
    )
  }

  // Smart Paste 적용: 정형 카드
  const handleSmartPasteApply = useCallback((data: FieldApplyData) => {
    if (data.type !== type) {
      setType(data.type)
    }
    setFields(data.fields)
    if (data.title) setTitle(data.title)
    if (data.tags.length > 0) setTags(data.tags.join(', '))
  }, [type])

  // Smart Paste 적용: document 카드
  const handleDocumentPasteApply = useCallback((data: DocumentApplyData) => {
    setDocSections(data.sections)
    if (data.title && !title) setTitle(data.title)
    if (data.tags.length > 0 && !tags) setTags(data.tags.join(', '))
  }, [title, tags])

  const handleSave = async () => {
    setSaving(true)
    try {
      // document 타입은 중복 검사 불필요
      if (type !== 'document') {
        const duplicates = await checkDuplicates(
          type,
          fields.map((f) => ({ key: f.key, value: f.value })),
          item?.id,
        )
        if (duplicates.length > 0) {
          const names = duplicates.map((d) => d.title || '제목없음').join(', ')
          toast.warning(`동일한 ${duplicates[0].matchField}가 이미 존재합니다: ${names}`)
        }
      }

      let content: string
      if (type === 'document') {
        if (docSections && docSections.length > 0) {
          const hybrid: HybridContent = { format: 'hybrid', sections: docSections }
          content = serializeContent(hybrid)
        } else {
          content = serializeContent(createEmptyHybridContent())
        }
      } else {
        content = serializeContent({ format: 'structured', fields } as StructuredContent)
      }
      const parsedTags = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      const now = Date.now()

      if (isEditMode && item) {
        await db.items.update(item.id, {
          title: title.trim(),
          type,
          tags: parsedTags,
          content,
          updatedAt: now,
        })
      } else {
        const newId = await db.items.add({
          folderId,
          title: title.trim(),
          type,
          tags: parsedTags,
          order: now,
          pinned: false,
          content,
          updatedAt: now,
          createdAt: now,
        })
        onClose()
        if (typeof newId === 'number') {
          openTab(newId, setOpenTabs, setActiveTab)
        }
        return
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl animate-scale-in max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
          <h2 className="text-base font-semibold text-[var(--text-primary)] m-0">
            {isEditMode ? '카드 편집' : '새 카드'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
          >
            <X size={18} />
          </button>
        </div>

        {/* 폼 본문 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* 타입 선택 — 그리드 카드 */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-2">카드 타입</label>
            <div className="grid grid-cols-3 gap-2">
              {ITEM_TYPES.map((t) => {
                const meta = TYPE_META[t]
                const Icon = ICON_MAP[t]
                const isActive = type === t
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={`flex flex-col items-center gap-1.5 rounded-lg py-3 px-2 text-xs font-medium transition-all cursor-pointer border ${
                      isActive
                        ? 'border-[var(--border-accent)] text-[var(--text-primary)] shadow-sm'
                        : 'border-[var(--border-default)] text-[var(--text-tertiary)] hover:border-[var(--border-subtle)] hover:text-[var(--text-secondary)]'
                    }`}
                    style={isActive ? { background: `var(--badge-${meta.colorKey}-bg)` } : { background: 'transparent' }}
                  >
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-lg"
                      style={{
                        background: isActive ? 'transparent' : `var(--badge-${meta.colorKey}-bg)`,
                        color: `var(--badge-${meta.colorKey}-text)`,
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Smart Paste — 생성 모드에서 모든 타입 표시 */}
          {!isEditMode && (
            <SmartPastePanel
              currentType={type}
              onApply={handleSmartPasteApply}
              onApplyDocument={handleDocumentPasteApply}
            />
          )}

          {/* 제목 */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1.5">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: Production 서버, AWS Console ..."
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
            />
          </div>

          {/* 태그 */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1.5">태그 (쉼표 구분)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="AWS, 운영, 백엔드"
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
            />
          </div>

          {/* 동적 필드들 */}
          {type === 'document' ? (
            <div className="space-y-3">
              {isEditMode ? (
                <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] px-4 py-4 text-center">
                  <p className="text-xs text-[var(--text-tertiary)] m-0">
                    문서 내용은 에디터에서 편집하세요
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[var(--text-tertiary)]">섹션 선택</label>
                  <div className="flex flex-wrap gap-1.5">
                    {SECTION_OPTIONS.map(({ type: sType, label, icon: Icon }) => (
                      <button
                        key={sType}
                        type="button"
                        onClick={() => setDocSections(prev => [...(prev ?? []), createSection(sType)])}
                        className="flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-transparent px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                      >
                        <Icon size={12} />
                        {label}
                      </button>
                    ))}
                  </div>
                  {docSections && docSections.length > 0 && (
                    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-hover)] divide-y divide-[var(--border-default)]">
                      {docSections.map((section, idx) => {
                        const opt = SECTION_OPTIONS.find(o => o.type === section.type)
                        const Icon = opt?.icon ?? FileText
                        return (
                          <div key={section.id} className="flex items-center justify-between px-3 py-2">
                            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                              <Icon size={12} className="text-[var(--text-tertiary)]" />
                              <span>{opt?.label ?? section.type}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDocSections(prev => prev ? prev.filter((_, i) => i !== idx) : null)}
                              className="rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] cursor-pointer bg-transparent border-none transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {(!docSections || docSections.length === 0) && (
                    <p className="text-xs text-[var(--text-placeholder)] py-1">
                      섹션을 선택하거나 Smart Paste로 내용을 붙여넣으세요
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-[var(--text-tertiary)]">필드</label>
              {fields.map((field) => {
                const schema = FIELD_SCHEMAS[type].find((s) => s.key === field.key)
                return (
                  <div key={field.key}>
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">
                      {field.label}
                    </label>
                    {field.type === 'multiline' ? (
                      <textarea
                        value={field.value}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        placeholder={schema?.placeholder}
                        rows={4}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none resize-y transition-colors"
                      />
                    ) : (
                      <input
                        type={field.type === 'password' ? 'password' : 'text'}
                        value={field.value}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        placeholder={schema?.placeholder}
                        className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--border-default)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer bg-transparent border-none"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer border-none"
          >
            {saving ? '저장 중...' : isEditMode ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}
