// src/features/sidebar/Sidebar.tsx

import { useMemo } from 'react'
import { useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { db } from '../../core/db'
import { openTabsAtom, activeTabAtom, settingsOpenAtom } from '../../store/atoms'
import { buildTree, getRootItems } from './treeUtils'
import { SortableItemRow, SortableFolderNode } from './TreeNode'
import { StorageButtons } from '../storage/StorageButtons'

export function Sidebar() {
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)

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

  // ─── DnD 센서 설정 ────────────────────────────────────────────
  // distance: 5px — 클릭과 드래그 구분
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  // ─── DnD 완료 핸들러 ──────────────────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    // 아이템 재정렬 (같은 folderId 내)
    if (activeId.startsWith('i-') && overId.startsWith('i-')) {
      const activeItemId = parseInt(activeId.slice(2))
      const overItemId = parseInt(overId.slice(2))
      if (!items) return

      const activeItem = items.find((i) => i.id === activeItemId)
      const overItem = items.find((i) => i.id === overItemId)
      if (!activeItem || !overItem) return
      if (activeItem.folderId !== overItem.folderId) return // 교차 폴더 미지원

      const group = items
        .filter((i) => i.folderId === activeItem.folderId)
        .sort((a, b) => a.order - b.order)

      const oldIdx = group.findIndex((i) => i.id === activeItemId)
      const newIdx = group.findIndex((i) => i.id === overItemId)
      if (oldIdx === -1 || newIdx === -1) return

      const reordered = arrayMove(group, oldIdx, newIdx)
      await db.items.bulkPut(
        reordered.map((item, idx) => ({ ...item, order: (idx + 1) * 1000 })),
      )
      return
    }

    // 폴더 재정렬 (같은 parentId 내)
    if (activeId.startsWith('f-') && overId.startsWith('f-')) {
      const activeFolderId = parseInt(activeId.slice(2))
      const overFolderId = parseInt(overId.slice(2))
      if (!folders) return

      const activeFolder = folders.find((f) => f.id === activeFolderId)
      const overFolder = folders.find((f) => f.id === overFolderId)
      if (!activeFolder || !overFolder) return
      if (activeFolder.parentId !== overFolder.parentId) return

      const group = folders
        .filter((f) => f.parentId === activeFolder.parentId)
        .sort((a, b) => a.order - b.order)

      const oldIdx = group.findIndex((f) => f.id === activeFolderId)
      const newIdx = group.findIndex((f) => f.id === overFolderId)
      if (oldIdx === -1 || newIdx === -1) return

      const reordered = arrayMove(group, oldIdx, newIdx)
      await db.folders.bulkPut(
        reordered.map((folder, idx) => ({ ...folder, order: (idx + 1) * 1000 })),
      )
    }
  }

  // ─── SortableContext ID 목록 ───────────────────────────────────
  const rootItemSortIds = rootItems.map((i) => `i-${i.id}`)
  const rootFolderSortIds = treeNodes.map((n) => `f-${n.folder.id}`)

  // ─── 새 항목 / 폴더 생성 ──────────────────────────────────────
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
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-[#858585]">
            DevNote
          </div>
          {/* 환경설정 버튼 */}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex items-center justify-center rounded p-1 text-[#858585] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
            title="환경설정"
            aria-label="환경설정"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </button>
        </div>
        <div className="flex gap-1">
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            {/* 루트 아이템 정렬 */}
            <SortableContext items={rootItemSortIds} strategy={verticalListSortingStrategy}>
              {rootItems.map((item) => (
                <SortableItemRow key={item.id} item={item} depth={0} />
              ))}
            </SortableContext>
            {/* 루트 폴더 정렬 */}
            <SortableContext items={rootFolderSortIds} strategy={verticalListSortingStrategy}>
              {treeNodes.map((node) => (
                <SortableFolderNode key={node.folder.id} node={node} depth={0} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <StorageButtons />
    </aside>
  )
}
