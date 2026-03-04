// src/features/search/SearchPanel.tsx

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import Fuse from 'fuse.js'
import type { FuseResultMatch } from 'fuse.js'
import { db } from '../../core/db'
import type { Folder, ItemType } from '../../core/db'
import {
  searchOpenAtom,
  searchQueryAtom,
  openTabsAtom,
  activeTabAtom,
} from '../../store/atoms'

// ─── 타입 뱃지 (TreeNode.tsx와 동일 색상 시스템) ──────────────

const TYPE_BADGE: Record<ItemType, { label: string; className: string }> = {
  ssh:    { label: 'SSH',  className: 'bg-[#264f78] text-[#9cdcfe]' },
  db:     { label: 'DB',   className: 'bg-[#3a2d20] text-[#ce9178]' },
  http:   { label: 'HTTP', className: 'bg-[#1e3a1e] text-[#4ec9b0]' },
  note:   { label: 'TXT',  className: 'bg-[#2d2d2d] text-[#858585]' },
  custom: { label: 'ETC',  className: 'bg-[#2d2d2d] text-[#858585]' },
}

// ─── 하이라이트 렌더링 ─────────────────────────────────────────

type RangeTuple = readonly [number, number]

/**
 * Fuse.js match indices를 기반으로 매칭 문자에 하이라이트 적용
 * 매칭 구간: text-[#e5c07b] + font-semibold
 */
function renderHighlight(
  text: string,
  match: FuseResultMatch | undefined,
): React.ReactNode {
  if (!match || !match.indices || match.indices.length === 0) {
    return <span>{text}</span>
  }

  const indices = [...match.indices].sort((a, b) => a[0] - b[0]) as RangeTuple[]
  const parts: React.ReactNode[] = []
  let pos = 0

  for (const [start, end] of indices) {
    if (start > pos) {
      parts.push(<span key={`plain-${pos}`}>{text.slice(pos, start)}</span>)
    }
    parts.push(
      <mark
        key={`mark-${start}`}
        className="bg-transparent not-italic font-semibold text-[#e5c07b]"
      >
        {text.slice(start, end + 1)}
      </mark>,
    )
    pos = end + 1
  }

  if (pos < text.length) {
    parts.push(<span key={`plain-end`}>{text.slice(pos)}</span>)
  }

  return <>{parts}</>
}

// ─── 폴더 경로 ────────────────────────────────────────────────

/**
 * folderId → "상위 / 하위 / 현재폴더" 경로 문자열 생성
 * folderMap을 순회하며 parentId 체인을 역방향으로 추적
 */
function getFolderPath(
  folderId: number | null,
  folderMap: Map<number, Folder>,
): string {
  if (folderId === null) return '루트'

  const parts: string[] = []
  let current: Folder | undefined = folderMap.get(folderId)
  let depth = 0

  while (current && depth < 20) {
    parts.unshift(current.name)
    current =
      current.parentId !== null ? folderMap.get(current.parentId) : undefined
    depth++
  }

  return parts.join(' / ')
}

// ─── SearchPanel ───────────────────────────────────────────────

export function SearchPanel() {
  const [searchOpen, setSearchOpen] = useAtom(searchOpenAtom)
  const [searchQuery, setSearchQuery] = useAtom(searchQueryAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)

  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([])

  const items = useLiveQuery(() => db.items.orderBy('order').toArray(), [])
  const folders = useLiveQuery(() => db.folders.toArray(), [])

  // folderMap: id → Folder (폴더 경로 조회용)
  const folderMap = useMemo<Map<number, Folder>>(() => {
    if (!folders) return new Map()
    return new Map(folders.map((f) => [f.id, f]))
  }, [folders])

  // Fuse 인스턴스 — 패널이 열린 상태에서만 인덱싱
  const fuse = useMemo(() => {
    if (!items || !searchOpen) return null
    return new Fuse(items, {
      keys: [
        { name: 'title', weight: 0.8 },
        { name: 'tags',  weight: 0.2 },
      ],
      threshold: 0.4,
      includeMatches: true,
      ignoreLocation: true,
      minMatchCharLength: 1,
      shouldSort: true,
    })
  }, [items, searchOpen])

  // 검색 결과
  const results = useMemo(() => {
    if (!fuse || !searchQuery.trim()) return []
    return fuse.search(searchQuery, { limit: 50 })
  }, [fuse, searchQuery])

  // 쿼리 변경 핸들러 — selectedIndex와 resultRefs를 함께 리셋
  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
    setSelectedIndex(0)
    resultRefs.current = []
  }

  // 선택 항목 스크롤 동기화
  useEffect(() => {
    resultRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // 패널 열릴 때 input 포커스
  useEffect(() => {
    if (searchOpen) {
      // 마운트 직후 autoFocus가 작동하지 않는 경우 fallback
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [searchOpen])

  // 항목 선택: 탭 열기 + 패널 닫기
  const handleSelect = (itemId: number) => {
    setOpenTabs((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]))
    setActiveTab(itemId)
    setSearchOpen(false)
    setSearchQuery('')
  }

  // 패널 닫기
  const handleClose = () => {
    setSearchOpen(false)
    setSearchQuery('')
  }

  // 키보드 탐색 (input 포커스 상태에서 처리)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev,
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex].item.id)
        }
        break
      case 'Escape':
        e.preventDefault()
        handleClose()
        break
    }
  }

  if (!searchOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* 검색 패널 */}
      <div
        role="dialog"
        aria-label="검색"
        aria-modal="true"
        className="fixed left-1/2 top-[12%] z-50 w-full max-w-[520px] -translate-x-1/2 rounded-lg border border-[#454545] bg-[#252526] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 검색 입력창 */}
        <div className="flex items-center gap-2 border-b border-[#3c3c3c] px-3 py-2.5">
          {/* 돋보기 아이콘 */}
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-[#858585]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
            placeholder="항목 검색..."
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm text-[#d4d4d4] outline-none placeholder:text-[#555]"
            aria-label="검색어 입력"
          />

          {/* 결과 카운트 */}
          {searchQuery.trim() && (
            <span className="shrink-0 text-xs text-[#858585]">
              {results.length > 0 ? `${results.length}개` : '없음'}
            </span>
          )}

          {/* 닫기 버튼 */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="검색 닫기"
            className="flex shrink-0 items-center justify-center rounded p-0.5 text-[#858585] hover:bg-[#3c3c3c] hover:text-[#d4d4d4]"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        {/* 결과 목록 */}
        <div className="max-h-[320px] overflow-y-auto">
          {!searchQuery.trim() ? (
            <div className="px-4 py-6 text-center text-sm text-[#555]">
              검색어를 입력하세요
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[#555]">
              검색 결과가 없습니다
            </div>
          ) : (
            results.map((result, idx) => {
              const { item, matches } = result
              const isSelected = idx === selectedIndex
              const badge = TYPE_BADGE[item.type]
              const folderPath = getFolderPath(item.folderId, folderMap)

              // title 매칭 정보 추출
              const titleMatch = matches?.find((m) => m.key === 'title')

              return (
                <button
                  key={item.id}
                  ref={(el) => { resultRefs.current[idx] = el }}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                    isSelected ? 'bg-[#094771]' : 'hover:bg-[#2a2d2e]'
                  }`}
                  aria-selected={isSelected}
                >
                  {/* 타입 뱃지 */}
                  <span
                    className={`mt-0.5 shrink-0 rounded px-1 text-[10px] font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>

                  {/* 제목 + 폴더 경로 */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-[#d4d4d4]">
                      {renderHighlight(item.title, titleMatch)}
                    </span>
                    <span className="block truncate text-xs text-[#858585]">
                      {folderPath}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>

        {/* 하단 키보드 힌트 */}
        {results.length > 0 && (
          <div className="flex gap-3 border-t border-[#3c3c3c] px-3 py-1.5 text-[11px] text-[#555]">
            <span>↑↓ 탐색</span>
            <span>Enter 열기</span>
            <span>Esc 닫기</span>
          </div>
        )}
      </div>
    </>
  )
}
