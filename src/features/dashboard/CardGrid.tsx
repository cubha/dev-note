import { useMemo } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import Fuse from 'fuse.js'
import type { FuseResultMatch } from 'fuse.js'
import { db } from '../../core/db'
import type { Item } from '../../core/db'
import type { CardContent as CardContentType } from '../../core/types'
import { parseContent, extractSearchText } from '../../core/content'
import {
  searchQueryAtom,
  typeFilterAtom,
  tagFilterAtom,
  selectedFolderAtom,
  cardFormAtom,
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
} from '../../store/atoms'
import { openTab, removeItemsFromState } from '../../store/tabHelpers'
import { InfoCard } from '../cards/InfoCard'
import { EmptyState } from '../cards/EmptyState'
import { toast } from 'sonner'

interface ParsedItem {
  item: Item
  content: CardContentType
  searchText: string
}

interface DisplayItem extends ParsedItem {
  matches?: readonly FuseResultMatch[]
}

export function CardGrid() {
  const searchQuery = useAtomValue(searchQueryAtom)
  const typeFilter = useAtomValue(typeFilterAtom)
  const tagFilter = useAtomValue(tagFilterAtom)
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const setCardForm = useSetAtom(cardFormAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)

  const items = useLiveQuery(() => db.items.orderBy('order').toArray(), [])

  // 파싱 (동기 — 암호화 제거로 즉시 처리)
  const parsedItems = useMemo<ParsedItem[]>(() => {
    if (!items) return []
    return items.map((item) => {
      const content = parseContent(item.content)
      return { item, content, searchText: extractSearchText(content) }
    })
  }, [items])

  // 필터링
  const filteredItems = useMemo(() => {
    let result = parsedItems

    if (selectedFolder !== null) {
      result = result.filter((d) => d.item.folderId === selectedFolder)
    }
    if (typeFilter) {
      result = result.filter((d) => d.item.type === typeFilter)
    }
    if (tagFilter) {
      result = result.filter((d) => d.item.tags.includes(tagFilter))
    }

    result = [...result].sort((a, b) => {
      if (a.item.pinned && !b.item.pinned) return -1
      if (!a.item.pinned && b.item.pinned) return 1
      return a.item.order - b.item.order
    })

    return result
  }, [parsedItems, selectedFolder, typeFilter, tagFilter])

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

  const handleEdit = (item: Item) => {
    openTab(item.id, setOpenTabs, setActiveTab)
  }

  const handleDelete = async (item: Item) => {
    try {
      await db.items.delete(item.id)
      removeItemsFromState([item.id], setOpenTabs, setActiveTab, setDirtyItems)
      toast.success(`"${item.title}" 삭제됨`, { duration: 2000 })
    } catch (err) {
      toast.error(`삭제 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    }
  }

  const handleTogglePin = async (item: Item) => {
    try {
      const newPinned = !item.pinned
      await db.items.update(item.id, { pinned: newPinned })
      toast.success(newPinned ? '핀 고정됨' : '핀 해제됨', { duration: 2000 })
    } catch (err) {
      toast.error(`핀 변경 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    }
  }

  const handleAddCard = () => {
    setCardForm({ isOpen: true, editItem: null, folderId: selectedFolder })
  }

  if (!items) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--text-tertiary)]">로딩 중...</p>
      </div>
    )
  }

  if (displayItems.length === 0) {
    if (searchQuery.trim() || typeFilter || tagFilter) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="text-center space-y-2">
            <p className="text-sm text-[var(--text-tertiary)]">검색 결과가 없습니다</p>
            <p className="text-xs text-[var(--text-placeholder)]">다른 키워드로 검색하거나 필터를 변경해보세요</p>
          </div>
        </div>
      )
    }
    return <EmptyState onAddCard={handleAddCard} />
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="card-grid">
        {displayItems.map(({ item, content, matches }) => (
          <InfoCard
            key={item.id}
            item={item}
            content={content}
            matches={matches}
            onEdit={handleEdit}
            onDelete={(i) => void handleDelete(i)}
            onTogglePin={(i) => void handleTogglePin(i)}
          />
        ))}
      </div>
    </div>
  )
}
