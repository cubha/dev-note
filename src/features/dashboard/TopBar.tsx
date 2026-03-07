import { useState } from 'react'
import { useAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { Search, X, Filter, Tag } from 'lucide-react'
import { db } from '../../core/db'
import { searchQueryAtom, typeFilterAtom, tagFilterAtom } from '../../store/atoms'
import type { ItemType } from '../../core/db'
import { TYPE_META } from '../../core/types'

const FILTER_TYPES: (ItemType | null)[] = [null, 'server', 'db', 'api', 'note', 'custom']

export function TopBar() {
  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom)
  const [typeFilter, setTypeFilter] = useAtom(typeFilterAtom)
  const [tagFilter, setTagFilter] = useAtom(tagFilterAtom)
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false)

  // 사용 중인 태그 목록 수집
  const allItems = useLiveQuery(() => db.items.toArray(), [])
  const allTags = [...new Set((allItems ?? []).flatMap((i) => i.tags))].sort()

  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-surface)] px-5 py-3">
      {/* 검색 */}
      <div className="relative flex-1 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="카드 검색... (Ctrl+K)"
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] pl-9 pr-8 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)] focus:border-[var(--border-accent)] focus:outline-none transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] cursor-pointer bg-transparent border-none"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* 타입 필터 */}
      <div className="flex items-center gap-1">
        <Filter size={14} className="text-[var(--text-tertiary)] mr-1" />
        {FILTER_TYPES.map((ft) => {
          const isActive = typeFilter === ft
          const label = ft ? TYPE_META[ft].label : '전체'
          const colorKey = ft ? TYPE_META[ft].colorKey : null
          return (
            <button
              key={ft ?? 'all'}
              type="button"
              onClick={() => setTypeFilter(ft)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
                isActive
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
              }`}
              style={isActive && colorKey
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
        <div className="relative">
          <button
            type="button"
            onClick={() => setTagDropdownOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer border-none ${
              tagFilter
                ? 'bg-[var(--badge-custom-bg)] text-[var(--badge-custom-text)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
            }`}
          >
            <Tag size={12} />
            {tagFilter ? `#${tagFilter}` : '태그'}
          </button>
          {tagDropdownOpen && (
            <div className="absolute right-0 top-8 z-50 w-40 max-h-48 overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-raised)] py-1 shadow-lg animate-scale-in">
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
  )
}
