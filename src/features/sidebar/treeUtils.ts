// src/features/sidebar/treeUtils.ts

import { arrayMove } from '@dnd-kit/sortable'
import { db } from '../../core/db'
import type { Folder, Item } from '../../core/db'
import { DEFAULT_ORDER_GAP } from '../../shared/constants'

/** 트리 노드 단위 (폴더 1개 + 자식 폴더 + 직속 아이템) */
export interface FolderNode {
  folder: Folder
  children: FolderNode[]
  items: Item[]
}

/**
 * folders 배열과 items 배열을 받아 parentId 기준으로 중첩 트리를 조립
 * parentId가 null인 것 = 루트 폴더
 * 각 레벨에서 folder.order 기준 오름차순 정렬
 * 각 폴더의 items는 item.order 기준 오름차순 정렬
 */
export function buildTree(
  folders: Folder[],
  items: Item[],
  parentId: number | null = null,
): FolderNode[] {
  const childrenFolders = folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order)

  return childrenFolders.map((folder) => ({
    folder,
    children: buildTree(folders, items, folder.id),
    items: items
      .filter((i) => i.folderId === folder.id)
      .sort((a, b) => a.order - b.order),
  }))
}

/**
 * 어떤 폴더에도 속하지 않은 아이템 (folderId === null)
 * item.order 기준 오름차순 정렬
 */
export function getRootItems(items: Item[]): Item[] {
  return items
    .filter((i) => i.folderId === null)
    .sort((a, b) => a.order - b.order)
}

/**
 * 현재 사이드바 렌더 순서로 보이는 Item ID 목록을 반환
 * (Shift+Click 범위 선택에 사용)
 * - 루트 아이템 → 루트 폴더 (확장된 경우 재귀적으로 하위 포함)
 */
export function getFlatVisibleItemIds(
  treeNodes: FolderNode[],
  rootItems: Item[],
  expandedFolders: Set<number>,
): number[] {
  const result: number[] = rootItems.map((i) => i.id)

  function collectNode(node: FolderNode) {
    if (!expandedFolders.has(node.folder.id)) return
    for (const item of node.items) {
      result.push(item.id)
    }
    for (const child of node.children) {
      collectNode(child)
    }
  }

  for (const node of treeNodes) {
    collectNode(node)
  }

  return result
}

// ─── DnD 순수 함수 ────────────────────────────────────────────

/** Case 1: 항목(들)을 대상 폴더로 이동 */
export async function moveItemsToFolder(
  items: Item[],
  idsToMove: number[],
  targetFolderId: number,
): Promise<void> {
  const itemsToMove = items.filter(
    (i) => i.id !== undefined && idsToMove.includes(i.id) && i.folderId !== targetFolderId,
  )
  if (itemsToMove.length === 0) return

  const targetFolderItems = items.filter((i) => i.folderId === targetFolderId)
  const baseOrder = targetFolderItems.length > 0
    ? Math.max(...targetFolderItems.map((i) => i.order)) + DEFAULT_ORDER_GAP
    : DEFAULT_ORDER_GAP

  await db.items.bulkPut(
    itemsToMove.map((item, idx) => ({
      ...item,
      folderId: targetFolderId,
      order: baseOrder + idx * DEFAULT_ORDER_GAP,
    })),
  )
}

/** Case 2: 항목→항목 드롭 — 단일/다중 재정렬 또는 폴더 간 이동 */
export async function reorderItems(
  items: Item[],
  activeItemId: number,
  overItemId: number,
  selectedIds: number[],
): Promise<void> {
  const activeItem = items.find((i) => i.id === activeItemId)
  const overItem = items.find((i) => i.id === overItemId)
  if (!activeItem || !overItem) return

  const isMultiDrag = selectedIds.length > 1 && selectedIds.includes(activeItemId)

  if (isMultiDrag) {
    const itemsToMove = items.filter((i) => i.id !== undefined && selectedIds.includes(i.id))
    await db.transaction('rw', db.items, async () => {
      const targetGroup = items
        .filter((i) => i.folderId === overItem.folderId && !selectedIds.includes(i.id))
        .sort((a, b) => a.order - b.order)
      const overIdx = targetGroup.findIndex((i) => i.id === overItemId)
      const insertAt = overIdx === -1 ? targetGroup.length : overIdx
      const newGroup = [...targetGroup]
      newGroup.splice(insertAt, 0, ...itemsToMove.map((i) => ({ ...i, folderId: overItem.folderId })))
      await db.items.bulkPut(newGroup.map((item, idx) => ({ ...item, order: (idx + 1) * DEFAULT_ORDER_GAP })))
    })
  } else if (activeItem.folderId === overItem.folderId) {
    const group = items.filter((i) => i.folderId === activeItem.folderId).sort((a, b) => a.order - b.order)
    const oldIdx = group.findIndex((i) => i.id === activeItemId)
    const newIdx = group.findIndex((i) => i.id === overItemId)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(group, oldIdx, newIdx)
    await db.items.bulkPut(reordered.map((item, idx) => ({ ...item, order: (idx + 1) * DEFAULT_ORDER_GAP })))
  } else {
    await db.transaction('rw', db.items, async () => {
      const movedItem = { ...activeItem, folderId: overItem.folderId }
      const targetGroup = items.filter((i) => i.folderId === overItem.folderId).sort((a, b) => a.order - b.order)
      const overIdx = targetGroup.findIndex((i) => i.id === overItemId)
      const newGroup = [...targetGroup]
      newGroup.splice(overIdx, 0, movedItem)
      await db.items.bulkPut(newGroup.map((item, idx) => ({ ...item, order: (idx + 1) * DEFAULT_ORDER_GAP })))
    })
  }
}

/** Case 3: 폴더→폴더 드롭 — 같은 parent 내 순서 변경 */
export async function reorderFolders(
  folders: Folder[],
  activeFolderId: number,
  overFolderId: number,
): Promise<void> {
  const activeFolder = folders.find((f) => f.id === activeFolderId)
  const overFolder = folders.find((f) => f.id === overFolderId)
  if (!activeFolder || !overFolder) return
  if (activeFolder.parentId !== overFolder.parentId) return

  const group = folders.filter((f) => f.parentId === activeFolder.parentId).sort((a, b) => a.order - b.order)
  const oldIdx = group.findIndex((f) => f.id === activeFolderId)
  const newIdx = group.findIndex((f) => f.id === overFolderId)
  if (oldIdx === -1 || newIdx === -1) return

  const reordered = arrayMove(group, oldIdx, newIdx)
  await db.folders.bulkPut(reordered.map((folder, idx) => ({ ...folder, order: (idx + 1) * DEFAULT_ORDER_GAP })))
}

/**
 * BFS로 rootFolderId를 포함한 모든 하위 폴더/아이템 ID 수집
 */
export function collectDescendants(
  folders: Folder[],
  items: Item[],
  rootFolderId: number,
): { folderIds: number[]; itemIds: number[] } {
  const folderIds: number[] = []
  const itemIds: number[] = []
  const queue: number[] = [rootFolderId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    folderIds.push(currentId)

    for (const item of items) {
      if (item.folderId === currentId) itemIds.push(item.id)
    }
    for (const folder of folders) {
      if (folder.parentId === currentId) queue.push(folder.id)
    }
  }

  return { folderIds, itemIds }
}
