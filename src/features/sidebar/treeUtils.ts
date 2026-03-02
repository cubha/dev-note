// src/features/sidebar/treeUtils.ts

import type { Folder, Item } from '../../core/db'

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
