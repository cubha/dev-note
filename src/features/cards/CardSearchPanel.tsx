// src/features/cards/CardSearchPanel.tsx
//
// 카드(탭) 전역 검색 패널. 섹션과 무관하게 카드당 하나만 존재하며 전 카드 타입에서 같은 자리에 뜬다.
// 본문을 밀지 않도록 absolute 오버레이로 띄우고, 옵션 토글은 입력창 안에 넣는다(v2.2.0 계승).

import { useEffect, useRef } from 'react'
import type { SearchOptions } from '../../core/cardSearch'

interface CardSearchPanelProps {
  query: string
  replaceText: string
  options: SearchOptions
  matchCount: number
  currentIndex: number
  replaceOpen: boolean
  onQueryChange: (v: string) => void
  onReplaceTextChange: (v: string) => void
  onOptionsChange: (o: SearchOptions) => void
  onToggleReplace: () => void
  onNext: () => void
  onPrev: () => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onClose: () => void
}

const OPTION_DEFS: { key: keyof SearchOptions; glyph: string; label: string }[] = [
  { key: 'caseSensitive', glyph: 'Aa', label: '대소문자 구분' },
  { key: 'wholeWord', glyph: 'ab|', label: '단어 단위' },
  { key: 'regexp', glyph: '.*', label: '정규식' },
]

export const CardSearchPanel = ({
  query, replaceText, options, matchCount, currentIndex, replaceOpen,
  onQueryChange, onReplaceTextChange, onOptionsChange, onToggleReplace,
  onNext, onPrev, onReplaceOne, onReplaceAll, onClose,
}: CardSearchPanelProps) => {
  const searchRef = useRef<HTMLInputElement>(null)
  const replaceRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
    searchRef.current?.select()
  }, [])

  // 바꾸기를 펼치면 바꿀 내용으로 포커스를 옮긴다 (Ctrl+H 흐름)
  const prevOpen = useRef(replaceOpen)
  useEffect(() => {
    if (replaceOpen && !prevOpen.current) replaceRef.current?.focus()
    prevOpen.current = replaceOpen
  }, [replaceOpen])

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) onPrev(); else onNext() }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  const counter = query
    ? matchCount === 0 ? '결과 없음' : `${currentIndex + 1}/${matchCount}`
    : ''

  return (
    <div
      className="absolute right-3 top-3 z-20 grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-1.5 shadow-lg"
      style={{ boxShadow: '0 6px 18px var(--bg-overlay)' }}
      role="search"
      aria-label="카드 안에서 찾기"
    >
      {/* 펼침 토글 — 두 행에 걸쳐 세로 중앙 */}
      <button
        type="button"
        onClick={onToggleReplace}
        aria-expanded={replaceOpen}
        title={replaceOpen ? '바꾸기 접기' : '바꾸기 펼치기'}
        className="row-span-full self-center rounded px-1 py-1.5 text-[9px] leading-none text-[var(--text-tertiary)] hover:bg-[var(--bg-input-hover)] hover:text-[var(--text-primary)] bg-transparent border-none cursor-pointer"
      >
        {replaceOpen ? '▼' : '▶'}
      </button>

      {/* 찾기 행 */}
      <div className="col-start-2 flex items-center gap-1 whitespace-nowrap">
        <div className="flex items-center gap-0.5 rounded border border-[var(--border-default)] bg-[var(--bg-input)] py-px pl-1.5 pr-1 focus-within:border-[var(--border-accent)]" style={{ minWidth: '210px' }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="카드에서 찾기"
            aria-label="찾기"
            className="min-w-0 flex-1 border-none bg-transparent py-0.5 text-[var(--font-2xs)] text-[var(--text-primary)] outline-none"
          />
          {OPTION_DEFS.map(({ key, glyph, label }) => (
            <button
              key={key}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={!!options[key]}
              onClick={() => onOptionsChange({ ...options, [key]: !options[key] })}
              className={`shrink-0 rounded border px-1 py-px text-[10px] font-semibold leading-none cursor-pointer bg-transparent ${
                options[key]
                  ? 'border-[var(--border-accent)] bg-[var(--bg-accent-hover)] text-[var(--text-active)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-input-hover)]'
              }`}
            >
              {glyph}
            </button>
          ))}
        </div>

        <span className="shrink-0 px-0.5 text-[10px] tabular-nums text-[var(--text-tertiary)]" style={{ minWidth: '52px' }}>
          {counter}
        </span>
        <button type="button" onClick={onPrev} title="이전" aria-label="이전 결과" disabled={!matchCount} className="subtle-btn shrink-0 px-1.5 py-0.5 text-[11px] disabled:opacity-40">↑</button>
        <button type="button" onClick={onNext} title="다음" aria-label="다음 결과" disabled={!matchCount} className="subtle-btn shrink-0 px-1.5 py-0.5 text-[11px] disabled:opacity-40">↓</button>
        <button type="button" onClick={onClose} title="닫기" aria-label="검색 닫기" className="shrink-0 border-none bg-transparent px-1 text-[15px] leading-none text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer">×</button>
      </div>

      {/* 바꾸기 행 */}
      {replaceOpen && (
        <div className="col-start-2 flex items-center gap-1 whitespace-nowrap">
          <input
            ref={replaceRef}
            value={replaceText}
            onChange={(e) => onReplaceTextChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onReplaceOne() } }}
            placeholder="바꿀 내용"
            aria-label="바꿀 내용"
            className="min-w-0 flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-1.5 py-0.5 text-[var(--font-2xs)] text-[var(--text-primary)] outline-none focus:border-[var(--border-accent)]"
            style={{ minWidth: '120px' }}
          />
          <button type="button" onClick={onReplaceOne} disabled={!matchCount} className="subtle-btn shrink-0 px-2 py-0.5 text-[11px] disabled:opacity-40">바꾸기</button>
          <button type="button" onClick={onReplaceAll} disabled={!matchCount} className="subtle-btn shrink-0 px-2 py-0.5 text-[11px] disabled:opacity-40">모두</button>
        </div>
      )}
    </div>
  )
}
