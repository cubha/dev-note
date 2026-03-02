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
  tabStatesAtom,
} from '../../store/atoms'
import { collectDescendants } from '../../features/sidebar/treeUtils'

export function ContextMenu() {
  const menu = useAtomValue(contextMenuAtom)
  const setMenu = useSetAtom(contextMenuAtom)
  const setRenamingTarget = useSetAtom(renamingTargetAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const setTabStates = useSetAtom(tabStatesAtom)

  const folders = useLiveQuery(() => db.folders.toArray(), [])
  const items = useLiveQuery(() => db.items.toArray(), [])

  const closeMenu = () =>
    setMenu((prev) => ({ ...prev, isOpen: false }))

  const handleRename = () => {
    if (menu.targetId === null || menu.type === null) return
    setRenamingTarget({ id: menu.targetId, type: menu.type })
    closeMenu()
  }

  const handleDelete = async () => {
    if (menu.targetId === null || !folders || !items) return
    closeMenu()

    if (menu.type === 'folder') {
      const { folderIds, itemIds } = collectDescendants(
        folders,
        items,
        menu.targetId,
      )

      setOpenTabs((prev) => prev.filter((id) => !itemIds.includes(id)))
      setActiveTab((prev) =>
        prev !== null && itemIds.includes(prev) ? null : prev,
      )
      setDirtyItems((prev) => {
        const next = new Set(prev)
        itemIds.forEach((id) => next.delete(id))
        return next
      })
      setTabStates((prev) => {
        const next = new Map(prev)
        itemIds.forEach((id) => next.delete(id))
        return next
      })

      await db.transaction('rw', db.folders, db.items, async () => {
        await db.folders.bulkDelete(folderIds)
        await db.items.bulkDelete(itemIds)
      })
    } else if (menu.type === 'item') {
      const id = menu.targetId

      setOpenTabs((prev) => prev.filter((tabId) => tabId !== id))
      setActiveTab((prev) => (prev === id ? null : prev))
      setDirtyItems((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setTabStates((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })

      await db.items.delete(id)
    }
  }

  if (!menu.isOpen) return null

  return (
    <ul
      role="menu"
      onClick={(e) => e.stopPropagation()}
      className="fixed z-50 min-w-[192px] rounded border border-[#454545] bg-[#252526] py-1 shadow-lg"
      style={{ left: menu.x, top: menu.y }}
    >
      <li>
        <button
          role="menuitem"
          type="button"
          onClick={handleRename}
          className="w-full px-4 py-1.5 text-left text-sm text-[#cccccc] hover:bg-[#094771] hover:text-white"
        >
          이름 변경
        </button>
      </li>
      <li aria-hidden>
        <hr className="my-1 border-[#454545]" />
      </li>
      <li>
        <button
          role="menuitem"
          type="button"
          onClick={handleDelete}
          className="w-full px-4 py-1.5 text-left text-sm text-[#f48771] hover:bg-[#5a1d1d] hover:text-white"
        >
          {menu.type === 'folder' ? '폴더 및 하위 항목 삭제' : '항목 삭제'}
        </button>
      </li>
    </ul>
  )
}
