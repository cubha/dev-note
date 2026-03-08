import { useState, useEffect, useCallback } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { X, Terminal, Database, Globe, FileText, Puzzle, FileStack, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { nanoid } from 'nanoid'
import { db } from '../../core/db'
import type { Item, ItemType } from '../../core/db'
import type { CardField, StructuredContent, AnySection, HybridContent } from '../../core/types'
import { FIELD_SCHEMAS, TYPE_META } from '../../core/types'
import { parseContent, serializeContent, createEmptyStructuredContent, createEmptyHybridContent } from '../../core/content'
import { checkDuplicates } from '../../core/duplicate-check'
import { detectPatterns, localDocumentParse } from '../../core/smart-paste'
import { AIService } from '../../core/ai'
import type { DocumentPasteResult } from '../../core/ai'
import { openTabsAtom, activeTabAtom, aiApiKeyAtom } from '../../store/atoms'
import { openTab } from '../../store/tabHelpers'
import { SmartPastePanel } from './SmartPastePanel'

// AI 결과를 AnySection[] 로 변환
function convertAIResultToSections(result: DocumentPasteResult): AnySection[] {
  return result.sections.map((s) => {
    const id = nanoid(12)
    const base = { id, title: s.title, collapsed: false }

    switch (s.type) {
      case 'markdown':
        return { ...base, type: 'markdown' as const, text: s.content }
      case 'code':
        return { ...base, type: 'code' as const, language: 'text', code: s.content }
      case 'credentials': {
        try {
          const items = JSON.parse(s.content) as Array<{
            label?: string; category?: string; host?: string; port?: string
            username?: string; password?: string; database?: string; extra?: string
          }>
          return {
            ...base, type: 'credentials' as const,
            items: items.map(item => ({
              id: nanoid(8),
              label: item.label ?? '',
              category: (item.category ?? 'server') as 'server' | 'database' | 'other',
              host: item.host ?? '', port: item.port ?? '',
              username: item.username ?? '', password: item.password ?? '',
              database: item.database, extra: item.extra ?? '',
            })),
          }
        } catch {
          return { ...base, type: 'markdown' as const, text: s.content }
        }
      }
      case 'urls': {
        try {
          const items = JSON.parse(s.content) as Array<{
            label?: string; url?: string; method?: string; note?: string
          }>
          return {
            ...base, type: 'urls' as const,
            items: items.map(item => ({
              id: nanoid(8),
              label: item.label ?? '', url: item.url ?? '',
              method: item.method, note: item.note ?? '',
            })),
          }
        } catch {
          return { ...base, type: 'markdown' as const, text: s.content }
        }
      }
      case 'env': {
        try {
          const pairs = JSON.parse(s.content) as Array<{
            key?: string; value?: string; secret?: boolean
          }>
          return {
            ...base, type: 'env' as const,
            pairs: pairs.map(p => ({
              key: p.key ?? '', value: p.value ?? '', secret: p.secret ?? false,
            })),
          }
        } catch {
          return { ...base, type: 'markdown' as const, text: s.content }
        }
      }
      default:
        return { ...base, type: 'markdown' as const, text: s.content }
    }
  })
}

const ICON_MAP: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  custom: Puzzle,
  document: FileStack,
}

const ITEM_TYPES: ItemType[] = ['server', 'db', 'api', 'note', 'custom', 'document']

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
  const [docPasteText, setDocPasteText] = useState('')
  const [docPasteLoading, setDocPasteLoading] = useState(false)
  const [docSections, setDocSections] = useState<AnySection[] | null>(null)
  const apiKey = useAtomValue(aiApiKeyAtom)
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
    }
  }

  const updateField = (key: string, value: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, value } : f))
    )
  }

  // Smart Paste 적용 핸들러
  const handleSmartPasteApply = useCallback((data: {
    type: ItemType
    title: string
    tags: string[]
    fields: CardField[]
  }) => {
    if (data.type !== type) {
      setType(data.type)
    }
    setFields(data.fields)
    if (data.title) setTitle(data.title)
    if (data.tags.length > 0) setTags(data.tags.join(', '))
  }, [type])

  // Document Smart Paste — 텍스트를 섹션으로 구조화
  const handleDocPaste = useCallback(async () => {
    const text = docPasteText.trim()
    if (!text) return

    setDocPasteLoading(true)
    try {
      const hints = detectPatterns(text)

      // AI 키가 있으면 Tier 2, 없으면 Tier 1
      if (apiKey) {
        const service = new AIService(apiKey)
        const result: DocumentPasteResult = await service.documentSmartPaste(text, hints)

        // AI 결과 → AnySection[] 변환
        const sections = convertAIResultToSections(result)
        setDocSections(sections)

        if (result.title && !title) setTitle(result.title)
        if (result.suggestedTags.length > 0 && !tags) {
          setTags(result.suggestedTags.join(', '))
        }
        toast.success(`${sections.length}개 섹션으로 구조화됨 (AI)`, { duration: 2000 })
      } else {
        // Tier 1 — 정규식 기반 기본 구조화
        const parsed = localDocumentParse(text, hints)
        const sections: AnySection[] = parsed.sections.map(s => {
          const id = nanoid(12)
          switch (s.type) {
            case 'markdown':
              return { id, type: 'markdown', title: '메모', collapsed: false, text: s.content }
            case 'env': {
              const pairs = s.content.split('\n').map(line => {
                const idx = line.indexOf('=')
                return idx > 0
                  ? { key: line.slice(0, idx), value: line.slice(idx + 1), secret: false }
                  : { key: line, value: '', secret: false }
              })
              return { id, type: 'env', title: '환경변수', collapsed: false, pairs }
            }
            case 'urls': {
              const items = s.content.split('\n').filter(Boolean).map(url => ({
                id: nanoid(8), label: '', url, note: '',
              }))
              return { id, type: 'urls', title: 'URL', collapsed: false, items }
            }
            case 'code':
              return { id, type: 'code', title: '코드', collapsed: false, language: 'text', code: s.content }
            default:
              return { id, type: 'markdown', title: '', collapsed: false, text: s.content }
          }
        })

        setDocSections(sections)
        if (parsed.title && !title) setTitle(parsed.title)
        toast.success(`${sections.length}개 섹션으로 구조화됨 (Tier 1)`, { duration: 2000 })
      }
    } catch (err) {
      toast.error(`구조화 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setDocPasteLoading(false)
    }
  }, [docPasteText, apiKey, title, tags])

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

          {/* Smart Paste — 생성 모드에서만 표시 (document 제외) */}
          {!isEditMode && type !== 'document' && (
            <SmartPastePanel
              currentType={type}
              onApply={handleSmartPasteApply}
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

          {/* 동적 필드들 (document 타입은 Smart Paste 지원) */}
          {type === 'document' ? (
            <div className="space-y-3">
              {!isEditMode && (
                <>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)]">
                    텍스트 붙여넣기 (선택)
                  </label>
                  <textarea
                    value={docPasteText}
                    onChange={(e) => setDocPasteText(e.target.value)}
                    placeholder="서버 접속 정보, URL, 환경변수 등을 자유롭게 붙여넣으세요...&#10;비워두면 빈 문서가 생성됩니다."
                    rows={5}
                    className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none resize-y transition-colors"
                  />
                  {docPasteText.trim() && (
                    <button
                      type="button"
                      onClick={() => void handleDocPaste()}
                      disabled={docPasteLoading}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: apiKey ? 'var(--badge-api-bg)' : 'var(--badge-document-bg)',
                        color: apiKey ? 'var(--badge-api-text)' : 'var(--badge-document-text)',
                      }}
                    >
                      {docPasteLoading ? (
                        <><Loader2 size={12} className="animate-spin" /> 구조화 중...</>
                      ) : apiKey ? (
                        <><Sparkles size={12} /> AI로 섹션 분리</>
                      ) : (
                        <><FileStack size={12} /> 자동 구조화</>
                      )}
                    </button>
                  )}
                  {docSections && (
                    <div className="rounded-lg border border-[var(--border-accent)] bg-[var(--bg-surface-hover)] px-3 py-2">
                      <p className="text-xs font-medium text-[var(--text-secondary)] m-0 mb-1">
                        미리보기: {docSections.length}개 섹션
                      </p>
                      {docSections.map((s) => (
                        <div key={s.id} className="text-[11px] text-[var(--text-tertiary)]">
                          {s.type === 'markdown' ? '📝' : s.type === 'credentials' ? '🔑' : s.type === 'urls' ? '🔗' : s.type === 'env' ? '⚙️' : '💻'}{' '}
                          {s.title || s.type}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {isEditMode && (
                <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-hover)] px-4 py-4 text-center">
                  <p className="text-xs text-[var(--text-tertiary)] m-0">
                    문서 내용은 에디터에서 편집하세요
                  </p>
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
