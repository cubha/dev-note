// src/features/dashboard/AppHeader.tsx
//
// 통합 앱 헤더 — 로고(메인 이동) + 탭 목록(최대 5개 + 오버플로우) + 검색/필터(우측)

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Terminal, Database, Globe, FileText, Puzzle, FileStack,
  X, MoreHorizontal, Search, Filter, Tag, Sparkles, Loader2, Brain,
} from 'lucide-react'
import { toast } from 'sonner'
import { db } from '../../core/db'
import type { ItemType } from '../../core/db'
import { TYPE_META } from '../../core/types'
import { extractSearchText } from '../../core/content'
import { parseContent } from '../../core/content'
import { AIService } from '../../core/ai'
import {
  generateEmbedding, cosineSimilarity, onEmbeddingStatus, isEmbedderReady, getEmbedder,
} from '../../core/embeddings'
import {
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
  searchQueryAtom,
  typeFilterAtom,
  tagFilterAtom,
  searchModeAtom,
  aiSearchLoadingAtom,
  aiApiKeyAtom,
  semanticResultsAtom,
  embeddingStatusAtom,
} from '../../store/atoms'
import type { SearchMode } from '../../store/atoms'
import { closeTab } from '../../store/tabHelpers'

const TAB_ICON: Record<ItemType, React.ComponentType<{ size?: number; className?: string }>> = {
  server: Terminal,
  db: Database,
  api: Globe,
  note: FileText,
  custom: Puzzle,
  document: FileStack,
}

const OVERFLOW_BTN_W = 44 // "... N" 버튼 예약 너비
const FILTER_TYPES: (ItemType | null)[] = [null, 'server', 'db', 'api', 'note', 'custom', 'document']

export function AppHeader() {
  const openTabs = useAtomValue(openTabsAtom)
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const dirtyItems = useAtomValue(dirtyItemsAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)

  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom)
  const [typeFilter, setTypeFilter] = useAtom(typeFilterAtom)
  const [tagFilter, setTagFilter] = useAtom(tagFilterAtom)
  const [searchMode, setSearchMode] = useAtom(searchModeAtom)
  const [aiSearchLoading, setAiSearchLoading] = useAtom(aiSearchLoadingAtom)
  const apiKey = useAtomValue(aiApiKeyAtom)
  const setSemanticResults = useSetAtom(semanticResultsAtom)
  const [embeddingStatus, setEmbeddingStatus] = useAtom(embeddingStatusAtom)

  const [overflowOpen, setOverflowOpen] = useState(false)
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const tagRef = useRef<HTMLDivElement>(null)
  const tabContainerRef = useRef<HTMLDivElement>(null)
  const tabElsRef = useRef<Map<number, HTMLElement>>(new Map())
  const [visibleCount, setVisibleCount] = useState(() => openTabs.length || 100)

  const items = useLiveQuery(
    () => db.items.where('id').anyOf(openTabs).toArray(),
    [openTabs],
  )

  const recalculate = useCallback(() => {
    const container = tabContainerRef.current
    if (!container) return

    const available = container.offsetWidth
    let used = 0
    let count = 0

    for (let i = 0; i < openTabs.length; i++) {
      const el = tabElsRef.current.get(openTabs[i])
      const tabW = el ? el.offsetWidth : 160
      const isLast = i === openTabs.length - 1

      if (isLast) {
        if (used + tabW <= available) count++
      } else {
        if (used + tabW + OVERFLOW_BTN_W <= available) {
          used += tabW
          count++
        } else {
          break
        }
      }
    }

    const next = Math.max(1, count)
    setVisibleCount((prev) => (prev !== next ? next : prev))
  }, [openTabs])

  // 탭 컨테이너 크기 변화 감지
  useEffect(() => {
    const container = tabContainerRef.current
    if (!container) return
    const ro = new ResizeObserver(recalculate)
    ro.observe(container)
    return () => ro.disconnect()
  }, [recalculate])

  // 탭 목록·아이템 변경 시 즉시 재계산 (페인트 전)
  useLayoutEffect(() => {
    recalculate()
  }, [recalculate, items])

  const allItems = useLiveQuery(() => db.items.toArray(), [])
  const allTags = [...new Set((allItems ?? []).flatMap((i) => i.tags))].sort()

  // 검색 모드 토글 (keyword → ai → semantic → keyword)
  const cycleSearchMode = useCallback(() => {
    setSearchMode((prev: SearchMode) => {
      if (prev === 'keyword') return 'ai'
      if (prev === 'ai') return 'semantic'
      return 'keyword'
    })
    setSemanticResults(new Map<number, number>())
  }, [setSearchMode, setSemanticResults])

  // 임베딩 모델 상태 콜백 등록
  useEffect(() => {
    onEmbeddingStatus((status) => setEmbeddingStatus(status))
  }, [setEmbeddingStatus])

  // AI 자연어 검색 실행
  const handleAiSearch = useCallback(async () => {
    if (!apiKey || !searchQuery.trim() || searchMode !== 'ai') return
    setAiSearchLoading(true)
    try {
      const service = new AIService(apiKey)
      const result = await service.naturalQuery(searchQuery.trim(), allTags)
      if (result.typeFilter) {
        setTypeFilter(result.typeFilter as ItemType)
      }
      if (result.tagFilter) {
        setTagFilter(result.tagFilter)
      }
      if (result.searchTerms.length > 0) {
        setSearchQuery(result.searchTerms.join(' '))
      }
    } catch (err) {
      toast.error(`AI 검색 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setAiSearchLoading(false)
    }
  }, [apiKey, searchQuery, searchMode, allTags, setAiSearchLoading, setTypeFilter, setTagFilter, setSearchQuery])

  // 시맨틱 검색 실행
  const handleSemanticSearch = useCallback(async () => {
    if (!searchQuery.trim() || searchMode !== 'semantic') return
    setAiSearchLoading(true)
    try {
      // 모델 아직 로드 안 됐으면 초기화
      if (!isEmbedderReady()) {
        await getEmbedder()
      }
      const queryVec = await generateEmbedding(searchQuery.trim())
      const dbItems = await db.items.toArray()
      const results = new Map<number, number>()

      for (const item of dbItems) {
        const content = parseContent(item.content)
        const text = `${item.title} ${item.tags.join(' ')} ${extractSearchText(content)}`
        if (!text.trim()) continue

        // 기존 임베딩 조회 또는 실시간 생성
        const existing = await db.embeddings.where('itemId').equals(item.id).first()
        let itemVec: number[]

        if (existing) {
          itemVec = existing.vector
        } else {
          itemVec = await generateEmbedding(text)
          await db.embeddings.put({
            id: undefined as unknown as number,
            itemId: item.id,
            vector: itemVec,
            textHash: '',
            updatedAt: Date.now(),
          })
        }

        const sim = cosineSimilarity(queryVec, itemVec)
        if (sim > 0.3) {
          results.set(item.id, Math.round(sim * 100))
        }
      }

      setSemanticResults(results)
    } catch (err) {
      toast.error(`시맨틱 검색 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setAiSearchLoading(false)
    }
  }, [searchQuery, searchMode, setAiSearchLoading, setSemanticResults])

  // 오버플로우 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!overflowOpen) return
    const close = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false)
      }
    }
    document.addEventListener('click', close, { capture: true })
    return () => document.removeEventListener('click', close, { capture: true })
  }, [overflowOpen])

  // 태그 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!tagDropdownOpen) return
    const close = (e: MouseEvent) => {
      if (tagRef.current && !tagRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false)
      }
    }
    document.addEventListener('click', close, { capture: true })
    return () => document.removeEventListener('click', close, { capture: true })
  }, [tagDropdownOpen])

  const handleCloseTab = (e: React.MouseEvent, itemId: number) => {
    e.stopPropagation()
    closeTab(itemId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
  }

  const handleMiddleClick = (e: React.MouseEvent, itemId: number) => {
    if (e.button === 1) {
      e.preventDefault()
      closeTab(itemId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
    }
  }

  const visibleTabs = openTabs.slice(0, visibleCount)
  const hiddenTabs = openTabs.slice(visibleCount)

  return (
    <div className="flex items-stretch border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-2 shrink-0 min-h-[44px]">

      {/* ── 좌측: 탭 목록 ───────────────── */}
      <div className="flex items-stretch flex-1 min-w-0" ref={tabContainerRef}>

        {/* 탭 목록 */}
        {openTabs.length > 0 && (
          <>

            {visibleTabs.map((tabId) => {
              const item = items?.find((i) => i.id === tabId)
              const isActive = activeTab === tabId
              const isDirty = dirtyItems.has(tabId)
              const Icon = item ? TAB_ICON[item.type] : FileText

              return (
                <button
                  key={tabId}
                  ref={(el) => {
                    if (el) tabElsRef.current.set(tabId, el)
                    else tabElsRef.current.delete(tabId)
                  }}
                  type="button"
                  onClick={() => setActiveTab(tabId)}
                  onMouseDown={(e) => handleMiddleClick(e, tabId)}
                  className={`group/tab relative flex shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-colors cursor-pointer border-none ${
                    isActive
                      ? 'bg-[var(--bg-app)] text-[var(--text-primary)]'
                      : 'bg-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {/* 활성 탭 하단 강조선 */}
                  {isActive && (
                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" />
                  )}

                  <Icon size={13} className="shrink-0" />
                  <span className="max-w-[100px] truncate">
                    {item === undefined ? '...' : (item.title || '제목없음')}
                  </span>

                  {/* 미저장 dot */}
                  {isDirty && (
                    <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-warning)]" />
                  )}

                  {/* 닫기 버튼 */}
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => handleCloseTab(e, tabId)}
                    className={`shrink-0 rounded p-0.5 transition-colors ${
                      isActive
                        ? 'text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                        : 'text-transparent group-hover/tab:text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <X size={12} />
                  </span>
                </button>
              )
            })}

            {/* 오버플로우 `...` 버튼 */}
            {hiddenTabs.length > 0 && (
              <div className="relative flex items-center ml-0.5" ref={overflowRef}>
                <button
                  type="button"
                  onClick={() => setOverflowOpen((prev) => !prev)}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
                    overflowOpen || hiddenTabs.some((id) => id === activeTab)
                      ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                      : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)]'
                  }`}
                  title={`${hiddenTabs.length}개 탭 더 있음`}
                >
                  <MoreHorizontal size={14} />
                  <span className="text-[10px]">{hiddenTabs.length}</span>
                </button>

                {overflowOpen && (
                  <div className="absolute left-0 top-11 z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg animate-scale-in">
                    {hiddenTabs.map((tabId) => {
                      const item = items?.find((i) => i.id === tabId)
                      const isActive = activeTab === tabId
                      const isDirty = dirtyItems.has(tabId)
                      const Icon = item ? TAB_ICON[item.type] : FileText

                      return (
                        <button
                          key={tabId}
                          type="button"
                          onClick={() => {
                            setOpenTabs(prev => [tabId, ...prev.filter(id => id !== tabId)])
                            setActiveTab(tabId)
                            setOverflowOpen(false)
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-1.5 cursor-pointer bg-transparent border-none transition-colors ${
                            isActive
                              ? 'bg-[var(--bg-surface-hover)] text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                          }`}
                        >
                          <Icon size={12} className="shrink-0 text-[var(--text-tertiary)]" />
                          <span className="flex-1 text-xs text-left truncate">
                            {item === undefined ? '...' : (item.title || '제목없음')}
                          </span>
                          {isDirty && (
                            <span className="size-1.5 shrink-0 rounded-full bg-[var(--text-warning)]" />
                          )}
                          <span
                            role="button"
                            tabIndex={-1}
                            onClick={(e) => {
                              e.stopPropagation()
                              closeTab(tabId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
                              setOverflowOpen(false)
                            }}
                            className="shrink-0 rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] transition-colors"
                          >
                            <X size={11} />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 우측: 검색 + 타입 필터 + 태그 필터 ─── */}
      <div className="flex items-center gap-2 pl-3 shrink-0">

        {/* 검색 입력 */}
        <div className="relative flex items-center">
          {/* 모드 토글 */}
          <button
            type="button"
            onClick={cycleSearchMode}
            className={`flex items-center justify-center rounded-l-lg border border-r-0 border-[var(--border-default)] px-2 py-1.5 transition-colors cursor-pointer ${
              searchMode === 'ai'
                ? 'bg-[var(--badge-api-bg)] text-[var(--badge-api-text)] border-[var(--badge-api-text)]'
                : searchMode === 'semantic'
                  ? 'bg-[var(--badge-db-bg)] text-[var(--badge-db-text)] border-[var(--badge-db-text)]'
                  : 'bg-[var(--bg-input)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
            title={
              searchMode === 'ai' ? '자연어 검색 (AI)'
                : searchMode === 'semantic'
                  ? embeddingStatus.state === 'loading'
                    ? `모델 로딩 중... ${embeddingStatus.progress}%`
                    : '시맨틱 검색 (임베딩)'
                  : '키워드 검색'
            }
          >
            {aiSearchLoading
              ? <Loader2 size={14} className="animate-spin" />
              : searchMode === 'ai'
                ? <Sparkles size={14} />
                : searchMode === 'semantic'
                  ? <Brain size={14} />
                  : <Search size={14} />
            }
          </button>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (searchMode === 'ai') void handleAiSearch()
                  else if (searchMode === 'semantic') void handleSemanticSearch()
                }
              }}
              placeholder={
                searchMode === 'ai' ? 'AI 검색... (Enter)'
                  : searchMode === 'semantic' ? '시맨틱 검색... (Enter)'
                    : '검색... (Ctrl+K)'
              }
              className="w-44 rounded-r-lg border border-[var(--border-default)] bg-[var(--bg-input)] pl-3 pr-7 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setTypeFilter(null); setTagFilter(null); setSemanticResults(new Map<number, number>()) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 구분선 */}
        <div className="w-px h-5 bg-[var(--border-default)] shrink-0" />

        {/* 타입 필터 */}
        <div className="flex items-center gap-0.5">
          <Filter size={12} className="text-[var(--text-tertiary)] mr-0.5 shrink-0" />
          {FILTER_TYPES.map((ft) => {
            const isActive = typeFilter === ft
            const label = ft ? TYPE_META[ft].label : '전체'
            const colorKey = ft ? TYPE_META[ft].colorKey : null
            return (
              <button
                key={ft ?? 'all'}
                type="button"
                onClick={() => setTypeFilter(ft)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
                  isActive
                    ? 'text-[var(--text-primary)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
                style={
                  isActive && colorKey
                    ? { background: `var(--badge-${colorKey}-bg)`, color: `var(--badge-${colorKey}-text)` }
                    : isActive
                      ? { background: 'var(--bg-surface-hover)' }
                      : undefined
                }
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* 태그 필터 */}
        {allTags.length > 0 && (
          <div className="relative" ref={tagRef}>
            <button
              type="button"
              onClick={() => setTagDropdownOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
                tagFilter
                  ? 'bg-[var(--badge-custom-bg)] text-[var(--badge-custom-text)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Tag size={11} />
              {tagFilter ? `#${tagFilter}` : '태그'}
            </button>
            {tagDropdownOpen && (
              <div className="absolute right-0 top-9 z-50 w-40 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg animate-scale-in">
                <button
                  type="button"
                  onClick={() => { setTagFilter(null); setTagDropdownOpen(false) }}
                  className={`flex w-full items-center px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none ${
                    tagFilter === null ? 'text-[var(--text-active)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  전체
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => { setTagFilter(tag); setTagDropdownOpen(false) }}
                    className={`flex w-full items-center px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none ${
                      tagFilter === tag ? 'text-[var(--text-active)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
