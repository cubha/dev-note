// src/shared/hooks/useGlobalKeyboardShortcuts.ts
//
// 앱 전역 키보드 단축키 (에디터 포커스 여부에 따라 동적 활성화)
//
// Ctrl+N          새 항목 생성 (루트)
// Ctrl+Shift+N    새 폴더 생성 (루트)
// Escape          다중 선택 해제
// Delete          선택 항목 삭제 (에디터 포커스 없을 때만)

import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { db } from '../../core/db'
import {
  openTabsAtom,
  activeTabAtom,
  selectedItemsAtom,
  dirtyItemsAtom,
  tabStatesAtom,
} from '../../store/atoms'

export function useGlobalKeyboardShortcuts() {
  const setOpenTabs    = useSetAtom(openTabsAtom)
  const setActiveTab   = useSetAtom(activeTabAtom)
  const selectedItems  = useAtomValue(selectedItemsAtom)
  const setSelectedItems = useSetAtom(selectedItemsAtom)
  const setDirtyItems  = useSetAtom(dirtyItemsAtom)
  const setTabStates   = useSetAtom(tabStatesAtom)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CodeMirror 에디터 또는 인라인 input 포커스 시 단축키 비활성
      const isEditorFocused = document.activeElement?.closest('.cm-editor') !== null
      const isInputFocused =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement

      // ── Ctrl+N: 새 항목 (루트) ─────────────────────────────
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'n') {
        if (isEditorFocused || isInputFocused) return
        e.preventDefault()
        void db.items
          .add({
            folderId: null,
            title: '새 항목',
            type: 'note',
            tags: [],
            order: Date.now(),
            encryptedContent: null,
            iv: null,
            updatedAt: Date.now(),
            createdAt: Date.now(),
          })
          .then((id) => {
            setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]))
            setActiveTab(id)
          })
        return
      }

      // ── Ctrl+Shift+N: 새 폴더 (루트) ──────────────────────
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        if (isEditorFocused || isInputFocused) return
        e.preventDefault()
        void db.folders.add({
          parentId: null,
          name: '새 폴더',
          order: Date.now(),
          createdAt: Date.now(),
        })
        return
      }

      // ── Escape: 다중 선택 해제 ─────────────────────────────
      if (e.key === 'Escape') {
        if (selectedItems.size > 0) {
          setSelectedItems(new Set<number>())
        }
        return
      }

      // ── Delete: 선택 항목 삭제 (에디터 포커스 없을 때) ────
      if (e.key === 'Delete' && !isEditorFocused && !isInputFocused) {
        if (selectedItems.size === 0) return
        e.preventDefault()
        const ids = Array.from(selectedItems)
        setOpenTabs((prev) => prev.filter((id) => !ids.includes(id)))
        setActiveTab((prev) => (prev !== null && ids.includes(prev) ? null : prev))
        setDirtyItems((prev) => {
          const next = new Set(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
        setTabStates((prev) => {
          const next = new Map(prev)
          ids.forEach((id) => next.delete(id))
          return next
        })
        setSelectedItems(new Set<number>())
        void db.items.bulkDelete(ids)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    selectedItems,
    setOpenTabs,
    setActiveTab,
    setSelectedItems,
    setDirtyItems,
    setTabStates,
  ])
}
