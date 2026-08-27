// src/features/dashboard/useCardSearch.ts
//
// 카드 데이터 로드 + 필터/정렬 + Fuse 검색 — CardGrid.tsx:56-125에서 추출(F2).
// 카드가 열려 있어(CardGrid 언마운트) 검색이 안 되던 문제를 해소하기 위해, 카드 열림
// 여부와 무관하게 항상 실행되도록 독립 훅으로 분리했다. CardGrid와 SearchResultsOverlay가
// 공용으로 사용한다 — 동일 검색 로직이 두 곳에서 갈라지지 않도록 여기 한 곳만 둔다.

import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import Fuse from 'fuse.js'
import type { FuseResultMatch } from 'fuse.js'
import { db } from '../../core/db'
import type { Item } from '../../core/db'
import type { CardContent as CardContentType } from '../../core/types'
import { parseContent, extractSearchText } from '../../core/content'
import { filterAndSortItems } from '../../core/cardFilter'
import { decryptTagsForDisplay } from '../../core/metaCrypto'
import {
  encryptionKeyAtom,
  searchQueryAtom,
  typeFilterAtom,
  tagFilterAtom,
  selectedFolderAtom,
  sortOrderAtom,
} from '../../store/atoms'

export interface ParsedItem {
  item: Item
  content: CardContentType
  searchText: string
}

export interface DisplayItem extends ParsedItem {
  matches?: readonly FuseResultMatch[]
}

export function useCardSearch() {
  const searchQuery = useAtomValue(searchQueryAtom)
  const typeFilter = useAtomValue(typeFilterAtom)
  const tagFilter = useAtomValue(tagFilterAtom)
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const sortOrder = useAtomValue(sortOrderAtom)
  const encryptionKey = useAtomValue(encryptionKeyAtom)

  // 태그는 암호화되어 저장되므로 데이터 소스에서 한 번에 복호화한다 — 필터·Fuse 인덱스·
  // InfoCard 칩이 전부 이 배열을 쓰므로, 여기만 바꾸면 하위 코드는 그대로 평문으로 동작한다.
  const items = useLiveQuery(async () => {
    const rows = await db.items.orderBy('order').toArray()
    return Promise.all(rows.map(async (item) => ({ ...item, tags: await decryptTagsForDisplay(item.tags, encryptionKey) })))
  }, [encryptionKey])

  // 파싱 (동기 — 암호화 제거로 즉시 처리)
  const parsedItems = useMemo<ParsedItem[]>(() => {
    if (!items) return []
    return items.map((item) => {
      const content = parseContent(item.content)
      return { item, content, searchText: extractSearchText(content) }
    })
  }, [items])

  // 필터링 + 정렬 + draft 제외 (core/cardFilter.ts 단일 소스)
  const filteredItems = useMemo(
    () => filterAndSortItems(parsedItems, { selectedFolder, typeFilter, tagFilter, sortOrder }),
    [parsedItems, selectedFolder, typeFilter, tagFilter, sortOrder],
  )

  // Fuse.js 인스턴스 (filteredItems 변경 시에만 재생성)
  const fuse = useMemo(
    () =>
      new Fuse(filteredItems, {
        keys: [
          { name: 'item.title', weight: 0.6 },
          { name: 'item.tags', weight: 0.2 },
          { name: 'searchText', weight: 0.2 },
        ],
        threshold: 0.4,
        includeScore: true,
        includeMatches: true,
      }),
    [filteredItems],
  )

  // 검색
  const displayItems = useMemo((): DisplayItem[] => {
    if (!searchQuery.trim()) return filteredItems
    return fuse.search(searchQuery).map((result) => ({
      ...result.item,
      matches: result.matches,
    }))
  }, [filteredItems, searchQuery, fuse])

  return {
    /** 원본(전체, draft 제외, order 정렬) — DnD 재정렬 인덱스 계산용 */
    items,
    /** 폴더/타입/태그 필터+정렬 적용, 검색어 미반영 */
    filteredItems,
    /** 검색어까지 반영된 최종 표시 목록 */
    displayItems,
    searchQuery,
    typeFilter,
    tagFilter,
  }
}
