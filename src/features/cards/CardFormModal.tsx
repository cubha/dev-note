import { useState, useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { X, Terminal, Database, Globe, FileText, Puzzle } from 'lucide-react'
import { db } from '../../core/db'
import type { Item, ItemType } from '../../core/db'
import type { CardField, StructuredContent } from '../../core/types'
import { FIELD_SCHEMAS, TYPE_META } from '../../core/types'
import { parseContent, serializeContent, createEmptyStructuredContent } from '../../core/content'
import { safeEncrypt, safeDecrypt } from '../../core/crypto'
import { cryptoKeyAtom, openTabsAtom, activeTabAtom } from '../../store/atoms'
import { openTab } from '../../store/tabHelpers'

const ICON_MAP: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  custom: Puzzle,
}

const ITEM_TYPES: ItemType[] = ['server', 'db', 'api', 'note', 'custom']

interface CardFormModalProps {
  item: Item | null          // null = 새 카드 생성 모드
  folderId: number | null    // 새 카드 생성 시 기본 폴더
  onClose: () => void
}

export function CardFormModal({ item, folderId, onClose }: CardFormModalProps) {
  const cryptoKey = useAtomValue(cryptoKeyAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType>('server')
  const [tags, setTags] = useState('')
  const [fields, setFields] = useState<CardField[]>([])
  const [saving, setSaving] = useState(false)
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

    void (async () => {
      const decrypted = await safeDecrypt(cryptoKey, item.encryptedContent, item.iv)
      const content = parseContent(decrypted)
      if (content.format === 'structured') {
        // 기존 필드 + 스키마에 있지만 데이터에 없는 필드 보충
        const schemas = FIELD_SCHEMAS[item.type]
        const merged: CardField[] = schemas.map((schema) => {
          const existing = content.fields.find((f) => f.key === schema.key)
          return existing ?? { key: schema.key, label: schema.label, value: '', type: schema.type }
        })
        setFields(merged)
      } else {
        // 레거시 → note content 필드로 변환
        const noteFields = createEmptyStructuredContent(item.type).fields
        if (noteFields.length > 0) {
          noteFields[0] = { ...noteFields[0], value: content.text }
        }
        setFields(noteFields)
      }
    })()
  }, [item, cryptoKey])

  // 타입 변경 시 필드 초기화 (생성 모드만)
  const handleTypeChange = (newType: ItemType) => {
    setType(newType)
    if (!isEditMode) {
      setFields(createEmptyStructuredContent(newType).fields)
    }
  }

  const updateField = (key: string, value: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, value } : f))
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const structured: StructuredContent = { format: 'structured', fields }
      const plaintext = serializeContent(structured)
      const { encryptedContent, iv } = await safeEncrypt(cryptoKey, plaintext)
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
          encryptedContent,
          iv,
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
          encryptedContent,
          iv,
          updatedAt: now,
          createdAt: now,
        })
        onClose()
        openTab(newId as number, setOpenTabs, setActiveTab)
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
