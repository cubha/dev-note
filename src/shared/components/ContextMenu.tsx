// src/shared/components/ContextMenu.tsx

import { useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/db'
import {
  contextMenuAtom,
  renamingTargetAtom,
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
  selectedItemsAtom,
} from '../../store/atoms'
import { collectDescendants } from '../../features/sidebar/treeUtils'
import { exportSelectedItems } from '../../features/storage/export'
import { removeItemsFromState } from '../../store/tabHelpers'

export function ContextMenu() {
  const menu = useAtomValue(contextMenuAtom)
  const setMenu = useSetAtom(contextMenuAtom)
  const setRenamingTarget = useSetAtom(renamingTargetAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const selectedItems = useAtomValue(selectedItemsAtom)
  const setSelectedItems = useSetAtom(selectedItemsAtom)

  const folders = useLiveQuery(() => db.folders.toArray(), [])
  const items = useLiveQuery(() => db.items.toArray(), [])

  const closeMenu = () =>
    setMenu((prev) => ({ ...prev, isOpen: false }))

  // 다중 선택 상태: 우클릭 대상이 선택된 항목 중 하나이고 2개 이상 선택됨
  const isMultiItemSelect =
    menu.type === 'item' &&
    menu.targetId !== null &&
    selectedItems.has(menu.targetId) &&
    selectedItems.size > 1

  // removeItemsFromState는 tabHelpers.ts에서 import

  const handleRename = () => {
    if (menu.targetId === null || menu.type === null) return
    setRenamingTarget({ id: menu.targetId, type: menu.type })
    closeMenu()
  }

  // ── 단일 항목/폴더 삭제 ─────────────────────────────────────
  const handleDelete = async () => {
    if (menu.targetId === null || !folders || !items) return
    closeMenu()

    if (menu.type === 'folder') {
      const { folderIds, itemIds } = collectDescendants(
        folders,
        items,
        menu.targetId,
      )

      removeItemsFromState(itemIds, setOpenTabs, setActiveTab, setDirtyItems)
      await db.transaction('rw', db.folders, db.items, async () => {
        await db.folders.bulkDelete(folderIds)
        await db.items.bulkDelete(itemIds)
      })
    } else if (menu.type === 'item') {
      const id = menu.targetId
      removeItemsFromState([id], setOpenTabs, setActiveTab, setDirtyItems)
      await db.items.delete(id)
    }
  }

  // ── 다중 선택 항목 일괄 삭제 ────────────────────────────────
  const handleMultiDelete = async () => {
    const ids = Array.from(selectedItems)
    closeMenu()
    removeItemsFromState(ids, setOpenTabs, setActiveTab, setDirtyItems)
    setSelectedItems(new Set<number>())
    await db.items.bulkDelete(ids)
  }

  // ── 다중 선택 항목 내보내기 ──────────────────────────────────
  const handleMultiExport = async () => {
    const ids = Array.from(selectedItems)
    closeMenu()
    await exportSelectedItems(ids)
  }

  if (!menu.isOpen) return null

  return (
    <ul
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 min-w-[192px] rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] py-1 shadow-lg"
      style={{ left: menu.x, top: menu.y }}
    >
      {/* 다중 선택 시: 이름 변경 숨김, 다중 삭제만 표시 */}
      {isMultiItemSelect ? (
        <>
          <li>
            <button
              role="menuitem"
              type="button"
              onClick={handleMultiExport}
              className="w-full px-4 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-accent-hover)] hover:text-[var(--text-on-active)]"
            >
              선택 항목 내보내기 ({selectedItems.size}개)
            </button>
          </li>
          <li aria-hidden>
            <hr className="my-1 border-[var(--border-subtle)]" />
          </li>
          <li>
            <button
              role="menuitem"
              type="button"
              onClick={handleMultiDelete}
              className="w-full px-4 py-1.5 text-left text-sm text-[var(--text-error)] hover:bg-[var(--bg-error-hover)] hover:text-white"
            >
              선택 항목 삭제 ({selectedItems.size}개)
            </button>
          </li>
        </>
      ) : (
        <>
          <li>
            <button
              role="menuitem"
              type="button"
              onClick={handleRename}
              className="w-full px-4 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-accent-hover)] hover:text-[var(--text-on-active)]"
            >
              이름 변경
            </button>
          </li>
          <li aria-hidden>
            <hr className="my-1 border-[var(--border-subtle)]" />
          </li>
          <li>
            <button
              role="menuitem"
              type="button"
              onClick={handleDelete}
              className="w-full px-4 py-1.5 text-left text-sm text-[var(--text-error)] hover:bg-[var(--bg-error-hover)] hover:text-white"
            >
              {menu.type === 'folder' ? '폴더 및 하위 항목 삭제' : '항목 삭제'}
            </button>
          </li>
        </>
      )}
    </ul>
  )
}
