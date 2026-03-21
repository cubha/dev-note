// src/features/dashboard/SearchFilterBar.tsx
//
// 검색 입력 + 타입 필터 + 태그 필터 + 공지사항 버튼

import { useState, useRef, useCallback } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, Filter, Tag, Bell, X } from 'lucide-react'
import { db } from '../../core/db'
import type { ItemType } from '../../core/db'
import { TYPE_META } from '../../core/types'
import {
  searchQueryAtom, typeFilterAtom, tagFilterAtom, announcementOpenAtom,
} from '../../store/atoms'
import { useClickOutside } from '../../shared/hooks/useClickOutside'

const FILTER_TYPES: (ItemType | null)[] = [null, 'server', 'db', 'api', 'note', 'document']

export function SearchFilterBar() {
  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom)
  const [typeFilter, setTypeFilter] = useAtom(typeFilterAtom)
  const [tagFilter, setTagFilter] = useAtom(tagFilterAtom)
  const setAnnouncementOpen = useSetAtom(announcementOpenAtom)

  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)
  const tagRef = useRef<HTMLDivElement>(null)

  const allTags = useLiveQuery(async () => {
    const tagSet = new Set<string>()
    await db.items.each(item => { for (const t of item.tags) tagSet.add(t) })
    return [...tagSet].sort()
  }, [])

  const closeTagDropdown = useCallback(() => setTagDropdownOpen(false), [])
  useClickOutside(tagRef, tagDropdownOpen, closeTagDropdown)

  return (
    <div className="flex items-center gap-2 pl-3 shrink-0">

      {/* 검색 입력 */}
      <div className="relative flex items-center">
        <Search size={14} className="absolute left-2.5 text-[var(--text-tertiary)] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="검색... (Ctrl+K)"
          className="w-44 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] pl-8 pr-7 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setTypeFilter(null); setTagFilter(null) }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
          >
            <X size={12} />
          </button>
        )}
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
      {allTags && allTags.length > 0 && (
        <div className="relative" ref={tagRef}>
          <button
            type="button"
            onClick={() => setTagDropdownOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
              tagFilter
                ? 'bg-[var(--badge-note-bg)] text-[var(--badge-note-text)]'
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

      {/* 구분선 */}
      <div className="w-px h-5 bg-[var(--border-default)] shrink-0" />

      {/* 공지사항 버튼 */}
      <button
        type="button"
        onClick={() => setAnnouncementOpen(true)}
        className="flex items-center justify-center rounded p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer bg-transparent border-none"
        title="공지사항"
      >
        <Bell size={15} />
      </button>
    </div>
  )
}
