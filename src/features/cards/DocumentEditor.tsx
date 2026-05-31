import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react'
import { nanoid } from 'nanoid'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus } from 'lucide-react'
import type { Item } from '../../core/db'
import type {
  AnySection, SectionType, HybridContent,
} from '../../core/types'
import { SECTION_OPTIONS } from '../../shared/constants'
import { parseContent, serializeContent, createSection, isEncryptedContent, encryptContent, decryptContent } from '../../core/content'
import { db } from '../../core/db'
import { useAtomValue } from 'jotai'
import { encryptionKeyAtom, appConfigAtom } from '../../store/atoms'
import { toast } from 'sonner'
import { SectionWrapper } from './sections/SectionWrapper'
import { CredentialSectionView } from './sections/CredentialSectionView'
import { UrlSectionView } from './sections/UrlSectionView'
import { EnvSectionView } from './sections/EnvSectionView'
import { CodeSectionView } from './sections/CodeSectionView'
import { MarkdownSectionView } from './sections/MarkdownSectionView'
import { useClickOutside } from '../../shared/hooks/useClickOutside'

// ── Smart Paste 파서 ──────────────────────

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi

const CREDENTIAL_PATTERNS: [string, RegExp][] = [
  ['host', /(?:host|호스트|ip|서버|address)\s*[:：=]\s*(.+)/i],
  ['port', /(?:port|포트)\s*[:：=]\s*(.+)/i],
  ['username', /(?:user(?:name)?|사용자|아이디|id)\s*[:：=]\s*(.+)/i],
  ['password', /(?:pass(?:word)?|비밀번호|pw)\s*[:：=]\s*(.+)/i],
  ['database', /(?:database|db(?:name)?|데이터베이스)\s*[:：=]\s*(.+)/i],
]

const parseSectionPaste = (section: AnySection, text: string): AnySection => {
  switch (section.type) {
    case 'markdown':
      return { ...section, text: section.text ? section.text + '\n' + text : text }
    case 'env': {
      const newPairs = text.split('\n').filter(l => l.trim()).map(line => {
        const eqIdx = line.indexOf('=')
        return eqIdx > 0
          ? { id: nanoid(8), key: line.slice(0, eqIdx).trim(), value: line.slice(eqIdx + 1).trim(), secret: false }
          : { id: nanoid(8), key: line.trim(), value: '', secret: false }
      })
      return { ...section, pairs: [...section.pairs, ...newPairs] }
    }
    case 'urls': {
      const found = text.match(URL_REGEX)
      const urls = found ?? text.split('\n').filter(l => l.trim()).map(l => l.trim())
      const newItems = urls.map(url => ({ id: nanoid(8), label: '', url, note: '' }))
      return { ...section, items: [...section.items, ...newItems] }
    }
    case 'credentials': {
      const entry: Record<string, string> = {}
      for (const [key, pattern] of CREDENTIAL_PATTERNS) {
        const match = text.match(pattern)
        if (match) entry[key] = match[1].trim()
      }
      const newItem = {
        id: nanoid(8),
        label: entry.host ? `${entry.host}${entry.port ? ':' + entry.port : ''}` : '',
        category: (entry.database ? 'database' : 'server') as 'server' | 'database' | 'other',
        host: entry.host ?? '', port: entry.port ?? '',
        username: entry.username ?? '', password: entry.password ?? '',
        database: entry.database, extra: '',
      }
      return { ...section, items: [...section.items, newItem] }
    }
    case 'code': {
      const cleaned = text.replace(/^```\w*\n?/, '').replace(/\n?```$/, '')
      return { ...section, code: section.code ? section.code + '\n' + cleaned : cleaned }
    }
  }
}

// ── 메인 컴포넌트 ──────────────────────────

export interface DocumentEditorHandle {
  save: () => Promise<void>
}

interface DocumentEditorProps {
  item: Item
  onDirtyChange: (dirty: boolean) => void
}

export const DocumentEditor = forwardRef<DocumentEditorHandle, DocumentEditorProps>(function DocumentEditor({ item, onDirtyChange }, ref) {
  const [sections, setSections] = useState<AnySection[]>([])
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const originalRef = useRef<string>('')
  const encryptionKey = useAtomValue(encryptionKeyAtom)
  const config = useAtomValue(appConfigAtom)
  const encryptionEnabled = config?.encryptionEnabled ?? false

  // @dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  // 아이템 로드 → sections 초기화 (암호화된 content는 복호화 후 파싱)
  useEffect(() => {
    void (async () => {
      let rawContent = item.content
      if (isEncryptedContent(rawContent)) {
        if (!encryptionKey) {
          setSections([])
          originalRef.current = JSON.stringify([])
          return
        }
        rawContent = await decryptContent(rawContent, encryptionKey)
      }
      const content = parseContent(rawContent)
      if (content.format === 'hybrid') {
        setSections(content.sections)
        originalRef.current = JSON.stringify(content.sections)
      } else {
        // document 타입이지만 아직 hybrid 아닌 경우 (초기 생성 직후)
        setSections([])
        originalRef.current = JSON.stringify([])
      }
    })()
  }, [item.id, item.content, encryptionKey])

  // dirty 감지
  useEffect(() => {
    const current = JSON.stringify(sections)
    onDirtyChange(current !== originalRef.current)
  }, [sections, onDirtyChange])

  // 저장 (암호화 활성 시 content 암호화 후 DB 저장)
  const handleSave = useCallback(async () => {
    try {
      const hybrid: HybridContent = { format: 'hybrid', sections }
      let content = serializeContent(hybrid)
      if (encryptionEnabled && encryptionKey) {
        content = await encryptContent(content, encryptionKey)
      }
      await db.items.update(item.id, { content, updatedAt: Date.now() })
      originalRef.current = JSON.stringify(sections)
      onDirtyChange(false)
      toast.success('저장됨', { duration: 1500 })
    } catch (err) {
      toast.error(`저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, { duration: 3000 })
    }
  }, [item.id, sections, onDirtyChange, encryptionKey, encryptionEnabled])

  // ref를 통해 외부에서 save 호출 가능
  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave])

  // 외부 클릭으로 추가 메뉴 닫기
  const closeAddMenu = useCallback(() => setAddMenuOpen(false), [])
  useClickOutside(addMenuRef, addMenuOpen, closeAddMenu)

  // 섹션 데이터 변경
  const handleSectionChange = useCallback((idx: number, updated: AnySection) => {
    setSections(prev => {
      const next = [...prev]
      next[idx] = updated
      return next
    })
  }, [])

  // 섹션 삭제
  const handleSectionDelete = useCallback((idx: number) => {
    setSections(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // 섹션 접기/펼치기
  const handleToggleCollapse = useCallback((idx: number) => {
    setSections(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], collapsed: !next[idx].collapsed }
      return next
    })
  }, [])

  // 섹션 제목 변경
  const handleTitleChange = useCallback((idx: number, title: string) => {
    setSections(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], title }
      return next
    })
  }, [])

  // 섹션 추가
  const handleAddSection = useCallback((type: SectionType) => {
    setSections(prev => [...prev, createSection(type)])
    setAddMenuOpen(false)
  }, [])

  // 섹션별 Smart Paste — 텍스트를 해당 섹션 타입에 맞게 파싱 후 병합
  const handleSectionSmartPaste = useCallback((idx: number, text: string) => {
    setSections(prev => {
      const next = [...prev]
      next[idx] = parseSectionPaste(next[idx], text)
      return next
    })
    toast.success('붙여넣기 적용됨', { duration: 1500 })
  }, [])

  // 드래그 완료 → 순서 변경
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setSections(prev => {
      const oldIdx = prev.findIndex(s => s.id === active.id)
      const newIdx = prev.findIndex(s => s.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return prev
      return arrayMove(prev, oldIdx, newIdx)
    })
  }, [])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map(s => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {sections.map((section, idx) => (
            <SortableSectionItem
              key={section.id}
              section={section}
              idx={idx}
              onChange={handleSectionChange}
              onDelete={handleSectionDelete}
              onToggleCollapse={handleToggleCollapse}
              onTitleChange={handleTitleChange}
              onSmartPaste={handleSectionSmartPaste}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* 섹션 추가 버튼 — 하단 */}
      <div className="relative" ref={addMenuRef}>
        <button
          type="button"
          onClick={() => setAddMenuOpen(!addMenuOpen)}
          className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border border-dashed border-[var(--border-default)] rounded-lg px-4 py-2.5 w-full justify-center hover:border-[var(--border-accent)] transition-colors"
        >
          <Plus size={14} /> 섹션 추가
        </button>

        {addMenuOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-48 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg animate-scale-in">
            {SECTION_OPTIONS.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => handleAddSection(type)}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] cursor-pointer bg-transparent border-none"
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

// ── Sortable 래퍼 ────────────────────────────

const SortableSectionItem = ({ section, idx, onChange, onDelete, onToggleCollapse, onTitleChange, onSmartPaste }: {
  section: AnySection
  idx: number
  onChange: (idx: number, section: AnySection) => void
  onDelete: (idx: number) => void
  onToggleCollapse: (idx: number) => void
  onTitleChange: (idx: number, title: string) => void
  onSmartPaste: (idx: number, text: string) => void
}) => {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <SectionWrapper
        type={section.type}
        title={section.title}
        collapsed={section.collapsed}
        onToggleCollapse={() => onToggleCollapse(idx)}
        onDelete={() => onDelete(idx)}
        onTitleChange={(title) => onTitleChange(idx, title)}
        onSmartPaste={(text) => onSmartPaste(idx, text)}
        dragHandleProps={{ ...attributes, ...listeners }}
      >
        <SectionContent
          section={section}
          onChange={(updated) => onChange(idx, updated)}
        />
      </SectionWrapper>
    </div>
  )
}

// ── 섹션 타입별 콘텐츠 렌더링 ──────────────────

const SectionContent = ({ section, onChange }: {
  section: AnySection
  onChange: (updated: AnySection) => void
}) => {
  switch (section.type) {
    case 'markdown':
      return (
        <MarkdownSectionView
          section={section}
          onChange={(updated) => onChange(updated)}
        />
      )
    case 'credentials':
      return (
        <CredentialSectionView
          items={section.items}
          onChange={(items) => onChange({ ...section, items })}
        />
      )
    case 'urls':
      return (
        <UrlSectionView
          items={section.items}
          onChange={(items) => onChange({ ...section, items })}
        />
      )
    case 'env':
      return (
        <EnvSectionView
          pairs={section.pairs}
          onChange={(pairs) => onChange({ ...section, pairs })}
        />
      )
    case 'code':
      return (
        <CodeSectionView
          section={section}
          onChange={(updated) => onChange(updated)}
        />
      )
    default: {
      const _exhaustive: never = section
      throw new Error(`Unhandled section type: ${(_exhaustive as AnySection).type}`)
    }
  }
}
