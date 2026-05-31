// src/shared/components/CommandPalette.tsx
//
// 커맨드 팔레트 — Mod+Shift+P 트리거
// Fuse.js 퍼지 검색 + 단축키 힌트 + ↑↓ 키보드 탐색

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import Fuse from 'fuse.js'
import { formatForDisplay } from '@tanstack/hotkeys'
import { db } from '../../core/db'
import {
  commandPaletteOpenAtom,
  effectiveKeybindingsAtom,
  cardFormAtom,
  selectedFolderAtom,
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
  selectedItemsAtom,
  searchQueryAtom,
} from '../../store/atoms'
import { closeTab, removeItemsFromState } from '../../store/tabHelpers'
import { DEFAULT_KEYBINDINGS } from '../../core/keybindings'
import type { CommandId } from '../../core/keybindings'
import { DEFAULT_FOLDER_NAME } from '../constants'
import { toast } from 'sonner'

// ─── 명령 항목 정의 ──────────────────────────────────────────────

interface Command {
  id: CommandId
  label: string
  category: string
  shortcut?: string
}

// 팔레트에 표시할 명령 목록 (editor 계열 제외 — 컨텍스트 의존적)
const PALETTE_COMMAND_IDS: CommandId[] = [
  'card.new',
  'folder.new',
  'tab.close',
  'search.focus',
  'card.save',
  'escape.clear',
  'selection.delete',
]

const CATEGORY_LABELS: Record<string, string> = {
  card: '카드',
  folder: '폴더',
  tab: '탭',
  search: '검색',
  ui: 'UI',
  editor: '에디터',
}

export const CommandPalette = () => {
  const isOpen = useAtomValue(commandPaletteOpenAtom)
  const setOpen = useSetAtom(commandPaletteOpenAtom)
  const effectiveKeys = useAtomValue(effectiveKeybindingsAtom)

  // 명령 실행에 필요한 atom setter들
  const setCardForm = useSetAtom(cardFormAtom)
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const openTabs = useAtomValue(openTabsAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const selectedItems = useAtomValue(selectedItemsAtom)
  const setSelectedItems = useSetAtom(selectedItemsAtom)
  const setSearchQuery = useSetAtom(searchQueryAtom)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // 명령 목록 (shortcut 포함)
  const commands = useMemo<Command[]>(() =>
    PALETTE_COMMAND_IDS.map((id) => ({
      id,
      label: DEFAULT_KEYBINDINGS[id].label,
      category: DEFAULT_KEYBINDINGS[id].category,
      shortcut: effectiveKeys[id]
        ? formatForDisplay(effectiveKeys[id])
        : undefined,
    })),
  [effectiveKeys])

  // Fuse.js 퍼지 검색
  const fuse = useMemo(
    () => new Fuse(commands, { keys: ['label', 'id', 'category'], threshold: 0.4 }),
    [commands],
  )

  const filtered = useMemo<Command[]>(
    () => query.trim() ? fuse.search(query).map((r) => r.item) : commands,
    [query, fuse, commands],
  )

  // 팔레트 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // 선택 인덱스 범위 조정
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // 선택 항목 스크롤 보정
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const close = useCallback(() => setOpen(false), [setOpen])

  // ─── 명령 실행 ──────────────────────────────────────────────────

  const executeCommand = useCallback((id: CommandId) => {
    close()
    switch (id) {
      case 'card.new':
        setCardForm({ isOpen: true, editItem: null, folderId: selectedFolder })
        break
      case 'folder.new':
        void db.folders.add({
          parentId: null,
          name: DEFAULT_FOLDER_NAME,
          order: Date.now(),
          createdAt: Date.now(),
        })
        break
      case 'tab.close':
        if (activeTab !== null) {
          closeTab(activeTab, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
        }
        break
      case 'search.focus':
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLInputElement>('input[placeholder*="검색"]')
          el?.focus()
          el?.select()
        })
        break
      case 'card.save':
        // Ctrl+S / Cmd+S 이벤트를 에디터로 전달
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 's', code: 'KeyS',
            ctrlKey: !navigator.userAgent.includes('Mac'),
            metaKey: navigator.userAgent.includes('Mac'),
            bubbles: true, cancelable: true,
          })
        )
        break
      case 'escape.clear':
        setSelectedItems(new Set<number>())
        setSearchQuery('')
        break
      case 'selection.delete': {
        const ids = Array.from(selectedItems)
        if (ids.length === 0) break
        setSelectedItems(new Set<number>())
        removeItemsFromState(ids, setOpenTabs, setActiveTab, setDirtyItems)
        void db.items.bulkDelete(ids).then(() => {
          toast.success(`${ids.length}개 항목 삭제됨`, { duration: 2000 })
        })
        break
      }
    }
  }, [
    close, setCardForm, selectedFolder, activeTab, openTabs,
    setOpenTabs, setActiveTab, setDirtyItems, selectedItems,
    setSelectedItems, setSearchQuery,
  ])

  // ─── 키보드 핸들러 ──────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[selectedIndex]) {
          executeCommand(filtered[selectedIndex].id)
        }
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
    }
  }, [filtered, selectedIndex, executeCommand, close])

  if (!isOpen) return null

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={close}
        aria-hidden
      />

      {/* 팔레트 패널 */}
      <div
        role="dialog"
        aria-label="커맨드 팔레트"
        aria-modal
        className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* 검색 인풋 */}
        <div className="flex items-center gap-2 border-b border-[var(--border-default)] px-4 py-3">
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0 text-[var(--text-placeholder)]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            placeholder="명령 검색..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] outline-none"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
          />
          <kbd className="rounded border border-[var(--border-default)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
            ESC
          </kbd>
        </div>

        {/* 명령 목록 */}
        <ul
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          className="max-h-72 overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
              결과 없음
            </li>
          ) : (
            filtered.map((cmd, i) => (
              <li
                key={cmd.id}
                role="option"
                aria-selected={i === selectedIndex}
                onClick={() => executeCommand(cmd.id)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex cursor-pointer items-center justify-between gap-4 px-4 py-2.5 text-sm transition-colors ${
                  i === selectedIndex
                    ? 'bg-[var(--bg-item-selected)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)] shrink-0">
                    {CATEGORY_LABELS[cmd.category] ?? cmd.category}
                  </span>
                  <span className="truncate">{cmd.label}</span>
                </div>
                {cmd.shortcut && (
                  <kbd className="shrink-0 rounded border border-[var(--border-default)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                    {cmd.shortcut}
                  </kbd>
                )}
              </li>
            ))
          )}
        </ul>

        {/* 푸터 힌트 */}
        <div className="flex items-center gap-3 border-t border-[var(--border-default)] px-4 py-2">
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
            <kbd className="rounded border border-[var(--border-default)] px-1 py-0.5">↑↓</kbd>
            탐색
          </span>
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
            <kbd className="rounded border border-[var(--border-default)] px-1 py-0.5">↵</kbd>
            실행
          </span>
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
            <kbd className="rounded border border-[var(--border-default)] px-1 py-0.5">ESC</kbd>
            닫기
          </span>
        </div>
      </div>
    </>
  )
}
