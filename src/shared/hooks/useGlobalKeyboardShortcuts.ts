// src/shared/hooks/useGlobalKeyboardShortcuts.ts
//
// 앱 전역 키보드 단축키
//
// Ctrl+N          새 카드 (카드 폼 모달 열기)
// Ctrl+Shift+N    새 폴더 생성 (루트)
// Ctrl+K          검색 포커스
// Ctrl+W          현재 활성 탭 닫기
// Escape          다중 선택 해제 / 검색 초기화
// Delete          선택 항목 삭제

import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { db } from '../../core/db'
import {
  selectedItemsAtom,
  cardFormAtom,
  searchQueryAtom,
  selectedFolderAtom,
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement

      // ── Ctrl+K: 검색 포커스 ─────────────────────────────
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder*="검색"]'
        )
        if (searchInput) {
          searchInput.focus()
          searchInput.select()
        }
        return
      }

      // ── Ctrl+W: 현재 활성 탭 닫기 ─────────────────────
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        if (activeTab !== null) {
          closeTab(activeTab, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
        }
        return
      }

      // ── Ctrl+N: 새 카드 (카드 폼 모달) ──────────────────
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'n') {
        if (isInputFocused) return
        e.preventDefault()
        setCardForm({ isOpen: true, editItem: null, folderId: selectedFolder })
        return
      }

      // ── Ctrl+Shift+N: 새 폴더 (루트) ──────────────────
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        if (isInputFocused) return
        e.preventDefault()
        void db.folders.add({
          parentId: null,
          name: '새 폴더',
          order: Date.now(),
          createdAt: Date.now(),
        })
        return
      }

      // ── Escape: 다중 선택 해제 + 검색 초기화 ──────────
      if (e.key === 'Escape') {
        if (selectedItems.size > 0) {
          setSelectedItems(new Set<number>())
        }
        setSearchQuery('')
        return
      }

      // ── Delete: 선택 항목 삭제 ──────────────────────────
      if (e.key === 'Delete' && !isInputFocused) {
        if (selectedItems.size === 0) return
        e.preventDefault()
        const ids = Array.from(selectedItems)
        setSelectedItems(new Set<number>())
        removeItemsFromState(ids, setOpenTabs, setActiveTab, setDirtyItems)
        void db.items.bulkDelete(ids).then(() => {
          toast.success(`${ids.length}개 항목 삭제됨`, { duration: 2000 })
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    selectedItems,
    selectedFolder,
    openTabs,
    activeTab,
    setSelectedItems,
    setCardForm,
    setSearchQuery,
    setOpenTabs,
    setActiveTab,
    setDirtyItems,
  ])
}
