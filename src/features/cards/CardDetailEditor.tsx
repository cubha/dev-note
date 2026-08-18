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
import type { ItemType, Item } from '../../core/db'
import { FIELD_SCHEMAS, TYPE_META } from '../../core/types'
import type { CardField, StructuredContent } from '../../core/types'
import { parseContent, serializeContent, isEncryptedContent, encryptContent, decryptContent } from '../../core/content'
import { encryptTags, decryptTags } from '../../core/metaCrypto'
import { isDraftPersistable, serializeDraftBody } from '../../core/draft'
import type { DraftBody } from '../../core/draft'
import { saveDraftRaw, loadDraft, deleteDraft, readDraft } from '../../core/draftStore'
import { registerActiveFlush, consumeSuppression, bumpDraftEpoch, currentDraftEpoch } from './draftFlushControl'
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

const DRAFT_DEBOUNCE_MS = 500

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
  // 잠긴 암호화 카드에 저장된(하지만 지금은 복호화 불가한) 드래프트가 있을 때만 true
  const [draftLocked, setDraftLocked] = useState(false)

  // 원본 스냅샷 — 값 비교 기반 dirty 판단
  interface OriginalSnapshot {
    title: string; type: ItemType; tags: string;
    fields: string; editorText: string
  }
  const [original, setOriginal] = useState<OriginalSnapshot | null>(null)

  // liveQuery가 무관 필드(핀/순서 등) 변경으로 재발화해도 편집 중인 로컬 상태를 지키기 위한 가드
  const loadedItemIdRef = useRef<number | null>(null)

  // 탭전환 cleanup·visibilitychange·외부 flush 요청이 참조하는 "항상 최신" 값 — 클로저 staleness 방지
  const itemRef = useRef<Item | null>(null)
  const dirtyRef = useRef(false)
  const draftStateRef = useRef({ title: '', type: 'server' as ItemType, tags: '', fields: [] as CardField[], editorText: '' })

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
    setDraftLocked(false)
  }, [activeTab])

  // 아이템 로드 (useLiveQuery 완료 후, 암호화된 content는 복호화 후 파싱)
  // 가드: id만 비교하면 사이드바 이름변경·재암호화·동기화 pull 같은 "진짜 콘텐츠 변경"까지
  // 침묵 무시하게 된다(핀/순서 변경과 구별 불가). 그래서 title/type/tags/content 지문으로 비교하되,
  // 편집 중(dirty)에는 외부 변경을 반영하지 않고 로컬 편집을 보존한다(이 기능 자체의 목적과 동일한 원칙 —
  // 외부변경 반영은 다음 저장 전까지 지연되는 게 알려진 제약, sync는 수동·last-writer-wins 기수용).
  const loadedFingerprintRef = useRef<string>('')
  useEffect(() => {
    if (!item) return
    const fingerprint = JSON.stringify([item.title, item.type, item.tags, item.content])
    const sameItem = loadedItemIdRef.current === item.id
    if (sameItem && loadedFingerprintRef.current === fingerprint) return // 무관 필드(핀/순서 등) 변경 — 무시
    if (sameItem && dirtyRef.current) return // 콘텐츠는 외부에서 바뀌었지만 편집 중 — 로컬 편집 보존

    void (async () => {
      if (isEncryptedContent(item.content) && !encryptionKey) {
        // 잠긴 암호화 카드 — 복호화 불가. 드래프트 존재 자체는 복호화 없이(raw row) 확인 가능하므로
        // 있으면 플레이스홀더로 안내한다. loadedItemIdRef는 갱신하지 않아 키 도착 시(encryptionKey
        // deps) 이 effect가 재실행되어 정상 로드·자동 복원된다.
        const rawDraft = await loadDraft(item.id)
        setDraftLocked(!!rawDraft)
        return
      }
      setDraftLocked(false)

      // 태그 복호화는 잠금 해제가 확인된 이 지점 이후에만 의미가 있다
      const tagsStr = (await decryptTags(item.tags, encryptionKey)).join(', ')

      let rawContent = item.content
      if (isEncryptedContent(rawContent)) {
        rawContent = await decryptContent(rawContent, encryptionKey!)
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

      // 드래프트 오버레이
      let draftApplied = false
      if (isDraftPersistable(item, encryptionKey)) {
        const result = await readDraft(item.id, encryptionKey)
        if (result.status === 'ok') {
          const { draft, body } = result
          setTitle(draft.title)
          setType(draft.type)
          setTags(draft.tags)
          if (body.kind === 'fields') {
            const fieldMap = new Map(body.fields)
            const schemas = FIELD_SCHEMAS[draft.type]
            setFields(schemas.map(s => ({
              key: s.key, label: s.label, value: fieldMap.get(s.key) ?? '', type: s.type,
            })))
            setEditorText(body.editorText)
          }
          // body.kind==='document'이면 fields/editorText는 그대로 두고 DocumentEditor가 sections을 자체 복원한다
          draftApplied = true
        }
        // 'corrupt' | 'none' → 아래 DB 값으로 폴백. 'locked'는 위에서 이미 처리되어 도달하지 않는다.
      }

      if (!draftApplied) {
        setTitle(item.title)
        setType(item.type)
        setTags(tagsStr)
        setFields(loadedFields)
        setEditorText(loadedEditorText)
      }

      // 원본 스냅샷은 항상 DB 값 기준(드래프트 유무와 무관) — dirty 판정·뱃지 유지의 기준점
      setOriginal({
        title: item.title,
        type: item.type,
        tags: tagsStr,
        fields: JSON.stringify(loadedFields.map(f => [f.key, f.value])),
        editorText: loadedEditorText,
      })

      loadedItemIdRef.current = item.id
      loadedFingerprintRef.current = fingerprint
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

  // document 타입 sections 변경 신호 — DocumentEditor가 onSectionsChange로 매 편집마다 호출.
  // 디바운스 effect의 deps에 넣어 "child state가 바뀌었는데 부모 effect는 모르는" 문제를 없앤다.
  const [docVersion, setDocVersion] = useState(0)
  const bumpDocVersion = useCallback(() => setDocVersion((v) => v + 1), [])

  // refs를 매 커밋마다 최신값으로 동기화 — cleanup·전역 flush 콜백은 클로저가 아닌 ref로 최신값을 읽는다
  const encryptionKeyRef = useRef<CryptoKey | null>(null)
  useEffect(() => {
    itemRef.current = item ?? null
    dirtyRef.current = dirty
    draftStateRef.current = { title, type, tags, fields, editorText }
    encryptionKeyRef.current = encryptionKey
  })

  // document 타입은 CardDetailEditor가 유일한 draft writer다(단일 행 upsert라 title/tags 쓰기와
  // sections 쓰기가 각자 read-modify-write하면 동시 flush 시 서로를 덮어쓰는 레이스가 생긴다).
  // 대신 DocumentEditor의 최신 sections를 getSections()로 동기 취득해 하나의 draft row로 합쳐 쓴다.
  const buildDraftBody = useCallback((): DraftBody | null => {
    const s = draftStateRef.current
    if (s.type === 'document') {
      const sections = docEditorRef.current?.getSections()
      if (!sections) return null // DocumentEditor 아직 마운트 전 — 다음 flush 기회에 재시도
      return { kind: 'document', sections }
    }
    return { kind: 'fields', fields: s.fields.map((f) => [f.key, f.value] as [string, string]), editorText: s.editorText }
  }, [])

  // 현재 편집 버퍼를 drafts 테이블에 즉시 기록.
  // loadedItemIdRef 가드: activeTab 전환 커밋 중 itemRef는 이미 새 탭을 가리키는데
  // draftStateRef(제목/필드 등 로컬 state)는 아직 리셋 전이라 이전 탭 값 그대로인 찰나의 창이 있다.
  // 이 창에서 flush가 발생하면 "새 탭 id로 이전 탭 내용을 저장"하는 탭 간 오염이 생기므로,
  // 로드가 완전히 끝나 item과 로컬 state가 실제로 일치할 때(loadedItemIdRef===it.id)만 기록한다.
  const flushDraftNow = useCallback(() => {
    const it = itemRef.current
    const s = draftStateRef.current
    const key = encryptionKeyRef.current
    if (!it) return
    if (loadedItemIdRef.current !== it.id) return
    if (!dirtyRef.current) return
    if (!isDraftPersistable(it, key)) return
    const body = buildDraftBody()
    if (!body) return
    const needsEncryption = isEncryptedContent(it.content)
    const bodyStr = serializeDraftBody(body)
    // 평문 카드는 encrypt를 거치지 않아 이 시점부터 saveDraftRaw까지 완전히 동기적으로 진행되므로
    // (기존과 동일하게) IndexedDB 요청 순서가 handleSave의 delete와 호출 순서대로 보장된다.
    // 암호화 카드만 encrypt로 인해 비동기 간극이 생기므로, 그 간극 동안 delete가 끼어들었는지
    // epoch로 재검증한 뒤에만 쓴다 — 그렇지 않으면 방금 지운 드래프트가 되살아날 수 있다.
    const epoch = currentDraftEpoch(it.id)
    void (async () => {
      const finalBodyStr = needsEncryption && key ? await encryptContent(bodyStr, key) : bodyStr
      // 태그도 items.tags와 같은 비밀이다 — 드래프트 행에만 평문으로 남기면 암호화가 새는 셈
      const finalTags = needsEncryption && key ? await encryptContent(s.tags, key) : s.tags
      if (currentDraftEpoch(it.id) !== epoch) return // 대기 중 삭제/커밋이 있었음 — 이 쓰기는 폐기
      await saveDraftRaw(it.id, { title: s.title, type: s.type, tags: finalTags, baseUpdatedAt: it.updatedAt, bodyStr: finalBodyStr })
    })()
  }, [buildDraftBody])

  // 탭 전환(activeTab 변경) 시 동기 flush — 억제 플래그가 서 있으면 건너뜀(닫기/폐기 직후 드래프트 재생성 방지)
  useEffect(() => {
    return () => {
      const it = itemRef.current
      if (!it) return
      // 잠긴 상태(암호화 카드인데 키 없음)면 애초에 편집이 불가능해 dirty가 성립하지 않으므로
      // 보통 도달하지 않는다(로더가 이 상태에선 편집 버퍼를 채우지 않음). 방어적으로만 스킵 —
      // 뱃지는 건드리지 않는다(암호화 카드도 이제 영속되므로, 지울 근거가 없다).
      if (!isDraftPersistable(it, encryptionKeyRef.current)) return
      if (consumeSuppression(it.id)) return
      flushDraftNow()
    }
  }, [activeTab, flushDraftNow])

  // 브라우저 종료/최소화 대비 — beforeunload는 커밋을 보장 못하므로 훨씬 이르게 발화하는 hidden 시점에 flush
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushDraftNow()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [flushDraftNow])

  // 디바운스 자동저장 — 키 입력(또는 document의 docVersion)마다 재스케줄, DRAFT_DEBOUNCE_MS 유휴 후 drafts에 기록.
  // loadedItemIdRef 가드는 flushDraftNow와 동일한 이유(탭전환 커밋 중 item↔로컬state 불일치 창 차단).
  useEffect(() => {
    if (!item) return
    if (loadedItemIdRef.current !== item.id) return
    if (!dirty) return
    if (!isDraftPersistable(item, encryptionKey)) return
    // flushDraftNow를 그대로 쓴다 — 예약 시점이 아닌 "발화 시점"에 loadedItemIdRef/dirtyRef를
    // 다시 확인하므로, 메인스레드 지연으로 타이머가 늦게 발화해도(예: Ctrl+S 저장과 겹침) stale
    // 클로저 값을 쓰지 않는다. 직접 saveDraft를 호출하면 발화 시점 재검증이 빠져 좀비 드래프트나
    // 탭전환 중 cross-tab 오염이 타이밍에 따라 재발할 수 있다(scope-critic 재검증 지적).
    const t = setTimeout(flushDraftNow, DRAFT_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [item, type, dirty, title, tags, fields, editorText, docVersion, flushDraftNow, encryptionKey])

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
    // 잠긴 카드(암호화된 content인데 키 없음)면 로더가 title/tags/fields를 채우지 않고
    // loadedItemIdRef를 이 item.id로 갱신하지도 않는다(위 로드 effect 참조) — 이 시점에
    // 편집 버퍼가 이 item의 실제 값과 무관한(대개 activeTab 리셋으로 빈) 상태이므로, 그대로
    // 저장하면 카드의 실제 내용이 빈 값으로 영구 덮어써진다. flushDraftNow·디바운스 자동저장은
    // 이미 isDraftPersistable로 이 경로를 막고 있었는데 수동 저장(Ctrl+S·버튼)만 빠져 있었다.
    if (loadedItemIdRef.current !== item.id) {
      toast.error('잠긴 카드는 저장할 수 없습니다 — 설정 → 보안에서 잠금을 해제해 주세요.', { duration: 3000 })
      return
    }
    try {
      let parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean)
      if (encryptionEnabled && encryptionKey) {
        parsedTags = await encryptTags(parsedTags, encryptionKey)
      }

      if (type === 'document') {
        // document 타입: title/tags 저장 + DocumentEditor content 저장 통합
        await db.items.update(item.id, {
          title, type, tags: parsedTags, updatedAt: Date.now(),
        })
        setOriginal(prev => prev ? { ...prev, title, type, tags } : null)
        if (docEditorRef.current) {
          await docEditorRef.current.save()
        }
        // setOriginal의 리렌더 커밋을 기다리지 않고 즉시 반영 — 그 사이 flush가 끼어들면
        // 방금 지운 드래프트가 되살아나는 레이스를 막는다(dirtyRef가 false여야 flushDraftNow가 no-op).
        // bumpDraftEpoch는 이미 in-flight인 암호화 flush(encrypt await 중)까지 잡아낸다.
        dirtyRef.current = false
        bumpDraftEpoch(item.id)
        await deleteDraft(item.id)
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
      // 원본 스냅샷 갱신 → dirty가 자동으로 false 됨(리렌더 이후). setOriginal 커밋을 기다리지 않고
      // dirtyRef를 즉시 갱신해, 그 사이 flush가 끼어들어 방금 지운 드래프트를 되살리는 레이스를 막는다.
      setOriginal({
        title, type, tags,
        fields: JSON.stringify(fields.map(f => [f.key, f.value])),
        editorText,
      })
      dirtyRef.current = false
      bumpDraftEpoch(item.id)
      await deleteDraft(item.id)
      toast.success('저장됨', { duration: 1500 })
    } catch (err) {
      toast.error(`저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, { duration: 3000 })
    }
  }, [item, fields, editorText, title, type, tags, encryptionKey, encryptionEnabled])

  // 닫기 confirm 등 외부에서 activeTab의 최신 편집분을 즉시 flush하거나(run) 저장할(save) 수 있도록 등록
  useEffect(() => {
    if (!item) return
    registerActiveFlush({ itemId: item.id, run: flushDraftNow, save: handleSave })
    return () => registerActiveFlush(null)
  }, [item, flushDraftNow, handleSave])

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
      {draftLocked && (
        <div className="mx-6 mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-[var(--text-warning)]">
          🔒 잠긴 미저장 변경사항이 있습니다. 설정 → 보안에서 잠금을 해제하면 자동으로 복원됩니다.
        </div>
      )}
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
        <DocumentEditor ref={docEditorRef} item={item} onDirtyChange={setDocDirty} onSectionsChange={bumpDocVersion} />
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
