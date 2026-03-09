// src/features/dashboard/TabContextMenu.tsx
//
// 탭 우클릭 컨텍스트 메뉴 — VS Code 스타일
// 메뉴 항목: 이름변경 | 카드편집 | 사이드바에서보기 | 닫기 | 다른탭모두닫기 | 오른쪽/왼쪽탭닫기 | 저장된탭닫기 | 모두닫기

import { useEffect, useRef } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/db'
import {
  tabContextMenuAtom,
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
  renamingTargetAtom,
  selectedFolderAtom,
  expandedFoldersAtom,
} from '../../store/atoms'
import {
  closeTab,
  closeOtherTabs,
  closeTabsToRight,
  closeTabsToLeft,
  closeSavedTabs,
  closeAllTabs,
} from '../../store/tabHelpers'

export function TabContextMenu() {
  const [menu, setMenu] = useAtom(tabContextMenuAtom)
  const [openTabs, setOpenTabs] = useAtom(openTabsAtom)
  const [activeTab, setActiveTab] = useAtom(activeTabAtom)
  const [dirtyItems, setDirtyItems] = useAtom(dirtyItemsAtom)
  const setRenamingTarget = useSetAtom(renamingTargetAtom)
  const setSelectedFolder = useSetAtom(selectedFolderAtom)
  const setExpandedFolders = useSetAtom(expandedFoldersAtom)

  const menuRef = useRef<HTMLUListElement>(null)

  const targetItem = useLiveQuery(
    () => (menu.tabId !== null ? db.items.get(menu.tabId) : undefined),
    [menu.tabId],
  )
  const folders = useLiveQuery(() => db.folders.toArray(), [])

  const closeMenu = () => setMenu((prev) => ({ ...prev, isOpen: false }))

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!menu.isOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu((prev) => ({ ...prev, isOpen: false }))
      }
    }
    document.addEventListener('click', handler, { capture: true })
    return () => document.removeEventListener('click', handler, { capture: true })
  }, [menu.isOpen, setMenu])

  // Esc 닫기
  useEffect(() => {
    if (!menu.isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu((prev) => ({ ...prev, isOpen: false }))
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menu.isOpen, setMenu])

  if (!menu.isOpen || menu.tabId === null) return null

  const tabId = menu.tabId
  const tabIndex = openTabs.indexOf(tabId)
  const isFirst = tabIndex === 0
  const isLast = tabIndex === openTabs.length - 1
  const isOnly = openTabs.length === 1
  const hasSavedTabs = openTabs.some((id) => !dirtyItems.has(id))

  // ── 핸들러 ──────────────────────────────────────────────────

  const handleRename = () => {
    setRenamingTarget({ id: tabId, type: 'item' })
    closeMenu()
  }

  const handleRevealInSidebar = () => {
    if (!targetItem || !folders) return
    const folderId = targetItem.folderId
    setSelectedFolder(folderId)
    if (folderId !== null) {
      // 상위 폴더 경로 전체 펼치기
      const ancestorIds: number[] = [folderId]
      let currentId: number | null = folderId
      while (currentId !== null) {
        const folder = folders.find((f) => f.id === currentId)
        if (!folder || folder.parentId === null) break
        ancestorIds.push(folder.parentId)
        currentId = folder.parentId
      }
      setExpandedFolders((prev) => {
        const next = new Set(prev)
        ancestorIds.forEach((id) => next.add(id))
        return next
      })
    }
    closeMenu()
  }

  const handleClose = () => {
    closeTab(tabId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
    closeMenu()
  }

  const handleCloseOthers = () => {
    closeOtherTabs(tabId, openTabs, setOpenTabs, setActiveTab, setDirtyItems)
    closeMenu()
  }

  const handleCloseToRight = () => {
    closeTabsToRight(tabId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
    closeMenu()
  }

  const handleCloseToLeft = () => {
    closeTabsToLeft(tabId, openTabs, activeTab, setOpenTabs, setActiveTab, setDirtyItems)
    closeMenu()
  }

  const handleCloseSaved = () => {
    closeSavedTabs(dirtyItems, openTabs, activeTab, setOpenTabs, setActiveTab)
    closeMenu()
  }

  const handleCloseAll = () => {
    closeAllTabs(setOpenTabs, setActiveTab, setDirtyItems)
    closeMenu()
  }

  // ── 스타일 ──────────────────────────────────────────────────

  const item = (disabled: boolean = false) =>
    disabled
      ? 'w-full flex items-center justify-between px-3 py-1.5 text-left text-xs text-[var(--text-tertiary)] cursor-not-allowed border-none bg-transparent select-none'
      : 'w-full flex items-center justify-between px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-accent-hover)] hover:text-[var(--text-on-active)] cursor-pointer border-none bg-transparent transition-colors'

  const sep = (
    <li aria-hidden>
      <hr className="my-1 border-[var(--border-subtle)]" />
    </li>
  )

  return (
    <ul
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[220px] rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-lg"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── 카드 작업 ── */}
      <li>
        <button role="menuitem" type="button" onClick={handleRename} className={item()}>
          이름 변경
        </button>
      </li>
      <li>
        <button
          role="menuitem"
          type="button"
          onClick={handleRevealInSidebar}
          disabled={!targetItem}
          className={item(!targetItem)}
        >
          사이드바에서 보기
        </button>
      </li>

      {sep}

      {/* ── 탭 닫기 ── */}
      <li>
        <button role="menuitem" type="button" onClick={handleClose} className={item()}>
          <span>닫기</span>
          <span className="ml-3 font-mono text-[10px] text-[var(--text-tertiary)]">Ctrl+W</span>
        </button>
      </li>
      <li>
        <button
          role="menuitem"
          type="button"
          onClick={handleCloseOthers}
          disabled={isOnly}
          className={item(isOnly)}
        >
          다른 탭 모두 닫기
        </button>
      </li>
      <li>
        <button
          role="menuitem"
          type="button"
          onClick={handleCloseToRight}
          disabled={isLast}
          className={item(isLast)}
        >
          오른쪽 탭 닫기
        </button>
      </li>
      <li>
        <button
          role="menuitem"
          type="button"
          onClick={handleCloseToLeft}
          disabled={isFirst}
          className={item(isFirst)}
        >
          왼쪽 탭 닫기
        </button>
      </li>

      {sep}

      <li>
        <button
          role="menuitem"
          type="button"
          onClick={handleCloseSaved}
          disabled={!hasSavedTabs}
          className={item(!hasSavedTabs)}
        >
          저장된 탭 닫기
        </button>
      </li>
      <li>
        <button role="menuitem" type="button" onClick={handleCloseAll} className={item()}>
          모든 탭 닫기
        </button>
      </li>
    </ul>
  )
}
