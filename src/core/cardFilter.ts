import type { Item, ItemType } from './db'
import { isDraft } from './cardState'

/** store/atoms.ts의 SortOrder와 동일한 값 집합 — core는 store에 의존하지 않으므로 별도 선언 */
export type SortOrder = 'default' | 'updatedAt' | 'title'

export interface FilterCriteria {
  selectedFolder: number | null
  typeFilter: ItemType | null
  tagFilter: string | null
  sortOrder: SortOrder
}

export interface FilterableItem {
  item: Item
}

/**
 * 폴더/타입/태그 필터 적용 + 핀 우선 정렬 + draft 제외.
 * CardGrid(그리드)와 검색 오버레이(F2)가 동일 규칙을 공유하도록 core에 둔 순수함수.
 */
export function filterAndSortItems<T extends FilterableItem>(
  items: T[],
  criteria: FilterCriteria,
): T[] {
  let result = items.filter((d) => !isDraft(d.item))

  if (criteria.selectedFolder !== null) {
    result = result.filter((d) => d.item.folderId === criteria.selectedFolder)
  }
  if (criteria.typeFilter) {
    result = result.filter((d) => d.item.type === criteria.typeFilter)
  }
  if (criteria.tagFilter) {
    result = result.filter((d) => d.item.tags.includes(criteria.tagFilter!))
  }

  return [...result].sort((a, b) => {
    if (a.item.pinned && !b.item.pinned) return -1
    if (!a.item.pinned && b.item.pinned) return 1
    switch (criteria.sortOrder) {
      case 'updatedAt':
        return b.item.updatedAt - a.item.updatedAt
      case 'title':
        return a.item.title.localeCompare(b.item.title, 'ko')
      default:
        return a.item.order - b.item.order
    }
  })
}
