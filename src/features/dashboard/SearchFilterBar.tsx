// src/features/dashboard/SearchFilterBar.tsx
//
// 검색 입력 + 타입 필터 + 태그 필터 + 공지사항 버튼

import { useAtom, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, Filter, Tag, Bell, X } from 'lucide-react'
import { db } from '../../core/db'
import type { ItemType } from '../../core/db'
import { TYPE_META } from '../../core/types'
import {
  searchQueryAtom, typeFilterAtom, tagFilterAtom, announcementOpenAtom,
} from '../../store/atoms'
import { Dropdown } from '../../shared/components/Dropdown'
import { IconButton } from '../../shared/components/IconButton'

const FILTER_TYPES: (ItemType | null)[] = [null, 'server', 'db', 'api', 'note', 'document']

export const SearchFilterBar = () => {
  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom)
  const [typeFilter, setTypeFilter] = useAtom(typeFilterAtom)
  const [tagFilter, setTagFilter] = useAtom(tagFilterAtom)
  const setAnnouncementOpen = useSetAtom(announcementOpenAtom)

  const allTags = useLiveQuery(async () => {
    const tagSet = new Set<string>()
    await db.items.each(item => { for (const t of item.tags) tagSet.add(t) })
    return [...tagSet].sort()
  }, [])

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
            className="subtle-btn absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5"
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
        <Dropdown
          trigger={
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
                tagFilter
                  ? 'bg-[var(--badge-note-bg)] text-[var(--badge-note-text)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
            >
              <Tag size={11} />
              {tagFilter ? `#${tagFilter}` : '태그'}
            </button>
          }
          items={[
            { label: '전체', value: '__all__' },
            ...allTags.map((tag) => ({ label: `#${tag}`, value: tag })),
          ]}
          value={tagFilter ?? '__all__'}
          onSelect={(val) => setTagFilter(val === '__all__' ? null : val)}
          align="right"
        />
      )}

      {/* 구분선 */}
      <div className="w-px h-5 bg-[var(--border-default)] shrink-0" />

      {/* 공지사항 버튼 */}
      <IconButton
        icon={<Bell size={15} />}
        size="md"
        tooltip="공지사항"
        onClick={() => setAnnouncementOpen(true)}
      />
    </div>
  )
}
