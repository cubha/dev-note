// src/features/sidebar/Sidebar.tsx

import { useMemo } from 'react'
import { useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../core/db'
import { openTabsAtom, activeTabAtom, searchOpenAtom } from '../../store/atoms'
import { buildTree, getRootItems } from './treeUtils'
import { ItemRow, TreeNode } from './TreeNode'

export function Sidebar() {
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setSearchOpen = useSetAtom(searchOpenAtom)

  const folders = useLiveQuery(() => db.folders.orderBy('order').toArray(), [])
  const items = useLiveQuery(() => db.items.orderBy('order').toArray(), [])

  const treeNodes = useMemo(() => {
    if (folders === undefined || items === undefined) return []
    return buildTree(folders, items)
  }, [folders, items])

  const rootItems = useMemo(() => {
    if (items === undefined) return []
    return getRootItems(items)
  }, [items])

  const isEmpty = folders !== undefined && items !== undefined
    && folders.length === 0 && items.length === 0

  const handleNewFolder = async () => {
    await db.folders.add({
      parentId: null,
      name: '새 폴더',
      order: Date.now(),
      createdAt: Date.now(),
    })
  }

  const handleNewItem = async () => {
    const id = await db.items.add({
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
    setOpenTabs((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setActiveTab(id)
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[#2d2d2d] bg-[#252526]">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-[#2d2d2d] bg-[#252526] p-3">
        <div className="text-xs uppercase tracking-widest text-[#858585]">
          DevNote
        </div>
        <div className="flex gap-1">
          {/* 검색 버튼 */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center justify-center rounded p-1.5 text-[#cccccc] hover:bg-[#2a2d2e]"
            title="검색 (Ctrl+F)"
            aria-label="검색"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleNewItem}
            className="flex items-center justify-center rounded p-1.5 text-[#cccccc] hover:bg-[#2a2d2e]"
            title="새 항목"
            aria-label="새 항목"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleNewFolder}
            className="flex items-center justify-center rounded p-1.5 text-[#cccccc] hover:bg-[#2a2d2e]"
            title="새 폴더"
            aria-label="새 폴더"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M3 7v10a1 1 0 001 1h16a1 1 0 001-1V7a1 1 0 00-1-1h-6l-2-2h-6a1 1 0 00-1 1z" />
              <path d="M12 11v6" />
              <path d="M9 14h6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {folders === undefined || items === undefined ? (
          <div className="p-3 text-xs text-[#858585]">로딩 중...</div>
        ) : isEmpty ? (
          <div className="p-4 text-center text-sm text-[#858585]">
            새 항목 버튼으로 시작하세요.
          </div>
        ) : (
          <>
            {rootItems.map((item) => (
              <ItemRow key={item.id} item={item} depth={0} />
            ))}
            {treeNodes.map((node) => (
              <TreeNode key={node.folder.id} node={node} depth={0} />
            ))}
          </>
        )}
      </div>
    </aside>
  )
}
