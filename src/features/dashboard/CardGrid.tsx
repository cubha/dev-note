import { useEffect, useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import Fuse from 'fuse.js'
import { db } from '../../core/db'
import type { Item } from '../../core/db'
import type { CardContent as CardContentType } from '../../core/types'
import { parseContent } from '../../core/content'
import { safeDecrypt } from '../../core/crypto'
import {
  cryptoKeyAtom,
  searchQueryAtom,
  typeFilterAtom,
  tagFilterAtom,
  selectedFolderAtom,
  cardFormAtom,
  openTabsAtom,
  activeTabAtom,
} from '../../store/atoms'
import { openTab } from '../../store/tabHelpers'
import { InfoCard } from '../cards/InfoCard'
import { EmptyState } from '../cards/EmptyState'
import { toast } from 'sonner'

interface DecryptedItem {
  item: Item
  content: CardContentType
}

export function CardGrid() {
  const cryptoKey = useAtomValue(cryptoKeyAtom)
  const searchQuery = useAtomValue(searchQueryAtom)
  const typeFilter = useAtomValue(typeFilterAtom)
  const tagFilter = useAtomValue(tagFilterAtom)
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const setCardForm = useSetAtom(cardFormAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const [decryptedItems, setDecryptedItems] = useState<DecryptedItem[]>([])

  const items = useLiveQuery(() => db.items.orderBy('order').toArray(), [])

  // 복호화 + 파싱
  useEffect(() => {
    if (!items) return

    void (async () => {
      const results: DecryptedItem[] = []
      for (const item of items) {
        const decrypted = await safeDecrypt(cryptoKey, item.encryptedContent, item.iv)
        const content = parseContent(decrypted)
        results.push({ item, content })
      }
      setDecryptedItems(results)
    })()
  }, [items, cryptoKey])

  // 필터링
  const filteredItems = useMemo(() => {
    let result = decryptedItems

    // 폴더 필터
    if (selectedFolder !== null) {
      result = result.filter((d) => d.item.folderId === selectedFolder)
    }

    // 타입 필터
    if (typeFilter) {
      result = result.filter((d) => d.item.type === typeFilter)
    }

    // 태그 필터
    if (tagFilter) {
      result = result.filter((d) => d.item.tags.includes(tagFilter))
    }

    // 핀 고정 항목을 상단으로
    result = [...result].sort((a, b) => {
      if (a.item.pinned && !b.item.pinned) return -1
      if (!a.item.pinned && b.item.pinned) return 1
      return a.item.order - b.item.order
    })

    return result
  }, [decryptedItems, selectedFolder, typeFilter, tagFilter])

  // 검색
  const displayItems = useMemo(() => {
    if (!searchQuery.trim()) return filteredItems

    const fuse = new Fuse(filteredItems, {
      keys: [
        { name: 'item.title', weight: 0.6 },
        { name: 'item.tags', weight: 0.2 },
      ],
      threshold: 0.4,
      includeScore: true,
    })

    return fuse.search(searchQuery).map((result) => result.item)
  }, [filteredItems, searchQuery])

  const handleEdit = (item: Item) => {
    openTab(item.id, setOpenTabs, setActiveTab)
  }

  const handleDelete = async (item: Item) => {
    await db.items.delete(item.id)
    toast.success(`"${item.title}" 삭제됨`, { duration: 2000 })
  }

  const handleTogglePin = async (item: Item) => {
    const newPinned = !item.pinned
    await db.items.update(item.id, { pinned: newPinned })
    toast.success(newPinned ? '핀 고정됨' : '핀 해제됨', { duration: 2000 })
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
        {displayItems.map(({ item, content }) => (
          <InfoCard
            key={item.id}
            item={item}
            content={content}
            onEdit={handleEdit}
            onDelete={(i) => void handleDelete(i)}
            onTogglePin={(i) => void handleTogglePin(i)}
          />
        ))}
      </div>
    </div>
  )
}
