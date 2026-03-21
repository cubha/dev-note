// src/shared/hooks/useGlobalKeyboardShortcuts.ts
//
// 앱 전역 키보드 단축키 — TanStack useHotkey 기반
//
// 기본 키 (effectiveKeybindingsAtom으로 동적 변경 가능):
// Mod+Alt+N       새 카드 (카드 폼 모달 열기)
// Mod+Alt+F       새 폴더 생성 (루트)
// Mod+Alt+W       현재 활성 탭 닫기
// Mod+K           검색 포커스
// Escape          다중 선택 해제 / 검색 초기화
// Delete          선택 항목 삭제

import { useAtomValue, useSetAtom } from 'jotai'
import { useHotkey } from '@tanstack/react-hotkeys'
import type { RegisterableHotkey } from '@tanstack/react-hotkeys'
import { db } from '../../core/db'
import {
  selectedItemsAtom,
  cardFormAtom,
  searchQueryAtom,
  selectedFolderAtom,
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
  effectiveKeybindingsAtom,
} from '../../store/atoms'
import { closeTab, removeItemsFromState } from '../../store/tabHelpers'
import { toast } from 'sonner'

export function useGlobalKeyboardShortcuts() {
  const selectedItems = useAtomValue(selectedItemsAtom)
  const setSelectedItems = useSetAtom(selectedItemsAtom)
  const setCardForm = useSetAtom(cardFormAtom)
  const setSearchQuery = useSetAtom(searchQueryAtom)
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const openTabs = useAtomValue(openTabsAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const keysRaw = useAtomValue(effectiveKeybindingsAtom)
  const keys = keysRaw as Record<string, RegisterableHotkey>

  // ── card.new: 새 카드 (카드 폼 모달) ─────────────────────────
  useHotkey(keys['card.new'], (e) => {
    e.preventDefault()
    setCardForm({ isOpen: true, editItem: null, folderId: selectedFolder })
  })

  // ── folder.new: 새 폴더 (루트) ───────────────────────────────
  useHotkey(keys['folder.new'], (e) => {
    e.preventDefault()
    void db.folders.add({
      parentId: null,
      name: '새 폴더',
      order: Date.now(),
      createdAt: Date.now(),
    })
  })

  // ── tab.close: 현재 활성 탭 닫기 ────────────────────────────
  useHotkey(keys['tab.close'], (e) => {
    e.preventDefault()
    if (activeTab !== null) {
      closeTab(activeTab, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
    }
  })

  // ── search.focus: 검색 포커스 ────────────────────────────────
  useHotkey(keys['search.focus'], (e) => {
    e.preventDefault()
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[placeholder*="검색"]'
    )
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
  })

  // ── escape.clear: 다중 선택 해제 + 검색 초기화 ──────────────
  useHotkey(keys['escape.clear'], () => {
    if (selectedItems.size > 0) {
      setSelectedItems(new Set<number>())
    }
    setSearchQuery('')
  })

  // ── selection.delete: 선택 항목 삭제 ────────────────────────
  useHotkey(keys['selection.delete'], (e) => {
    const isInputFocused =
      document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement
    if (isInputFocused) return
    if (selectedItems.size === 0) return
    e.preventDefault()
    const ids = Array.from(selectedItems)
    setSelectedItems(new Set<number>())
    removeItemsFromState(ids, setOpenTabs, setActiveTab, setDirtyItems)
    void db.items.bulkDelete(ids).then(() => {
      toast.success(`${ids.length}개 항목 삭제됨`, { duration: 2000 })
    })
  })
}
