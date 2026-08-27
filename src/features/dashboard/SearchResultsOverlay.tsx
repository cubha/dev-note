// src/features/dashboard/SearchResultsOverlay.tsx
//
// 카드가 열려 있어도(CardGrid 언마운트 상태) 검색이 동작하도록 하는 결과 오버레이(F2).
// activeTab !== null && searchQuery.trim() !== '' 일 때만 파생 열림 — 별도 열림 atom 없음.
// 입력창은 두지 않는다(헤더 검색창만 사용) — search.focus·CommandPalette가 전부
// `input[placeholder*="검색"]` querySelector로 검색창을 찾으므로, 두 번째 검색 input을
// 두면 그 querySelector가 엉뚱한 요소를 잡는다. CommandPalette와 동일한 레이아웃/톤을 따른다.

import { useEffect, useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { TYPE_META } from '../../core/types'
import { activeTabAtom, openTabsAtom, searchQueryAtom } from '../../store/atoms'
import { openTab } from '../../store/tabHelpers'
import { useDecryptedFolders } from '../../shared/hooks/useDecryptedFolders'
import { highlightByQuery } from '../../shared/utils/highlight'
import { ICON_MAP } from '../../shared/constants'
import { useCardSearch } from './useCardSearch'
import type { DisplayItem } from './useCardSearch'

export const SearchResultsOverlay = () => {
  const activeTab = useAtomValue(activeTabAtom)
  const searchQuery = useAtomValue(searchQueryAtom)
  const setSearchQuery = useSetAtom(searchQueryAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const folders = useDecryptedFolders()

  const isOpen = activeTab !== null && searchQuery.trim() !== ''

  const { displayItems } = useCardSearch()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const folderNameById = useMemo(() => {
    const map = new Map<number, string>()
    folders?.forEach((f) => map.set(f.id, f.name))
    return map
  }, [folders])

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, displayItems.length - 1)))
  }, [displayItems.length])

  const handleSelect = (item: DisplayItem['item']) => {
    openTab(item.id, setOpenTabs, setActiveTab)
    setSearchQuery('')
  }

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, displayItems.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          if (displayItems[selectedIndex]) {
            e.preventDefault()
            handleSelect(displayItems[selectedIndex].item)
          }
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, displayItems, selectedIndex])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[var(--bg-overlay)]" onClick={() => setSearchQuery('')} aria-hidden />

      <div
        role="dialog"
        aria-label="검색 결과"
        aria-modal
        className="fixed left-1/2 top-[20%] z-50 w-full max-w-2xl -translate-x-1/2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl"
      >
        <ul role="listbox" className="max-h-[60vh] overflow-y-auto py-1">
          {displayItems.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
              검색 결과가 없습니다
            </li>
          ) : (
            displayItems.map(({ item, matches }, i) => {
              const meta = TYPE_META[item.type]
              const Icon = ICON_MAP[item.type]
              const titleMatch = matches?.find((m) => m.key === 'item.title')
              return (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={i === selectedIndex}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    i === selectedIndex
                      ? 'bg-[var(--bg-item-selected)] text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                    style={{ background: `var(--badge-${meta.colorKey}-bg)`, color: `var(--badge-${meta.colorKey}-text)` }}
                  >
                    <Icon size={12} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {titleMatch ? highlightByQuery(item.title, searchQuery) : (item.title || '제목없음')}
                  </span>
                  <span className="shrink-0 truncate text-[var(--font-3xs)] text-[var(--text-tertiary)]">
                    {item.folderId !== null ? (folderNameById.get(item.folderId) ?? '') : '루트'}
                  </span>
                </li>
              )
            })
          )}
        </ul>

        <div className="flex items-center gap-3 border-t border-[var(--border-default)] px-4 py-2">
          <span className="flex items-center gap-1 text-[var(--font-3xs)] text-[var(--text-tertiary)]">
            <kbd className="rounded border border-[var(--border-default)] px-1 py-0.5">↑↓</kbd>
            탐색
          </span>
          <span className="flex items-center gap-1 text-[var(--font-3xs)] text-[var(--text-tertiary)]">
            <kbd className="rounded border border-[var(--border-default)] px-1 py-0.5">↵</kbd>
            열기
          </span>
          <span className="flex items-center gap-1 text-[var(--font-3xs)] text-[var(--text-tertiary)]">
            <kbd className="rounded border border-[var(--border-default)] px-1 py-0.5">ESC</kbd>
            닫기
          </span>
        </div>
      </div>
    </>
  )
}
