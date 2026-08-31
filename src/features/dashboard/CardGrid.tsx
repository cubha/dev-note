import { useState, useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { db } from '../../core/db'
import type { Item } from '../../core/db'
import { encryptTags, LOCKED_TAG_LABEL } from '../../core/metaCrypto'
import {
  encryptionKeyAtom,
  appConfigAtom,
  selectedFolderAtom,
  cardFormAtom,
  openTabsAtom,
  activeTabAtom,
  dirtyItemsAtom,
} from '../../store/atoms'
import { openTab, removeItemsFromState } from '../../store/tabHelpers'
import { useCardSearch } from './useCardSearch'
import { InfoCard } from '../cards/InfoCard'
import { EmptyState } from '../cards/EmptyState'
import { toast } from 'sonner'

export const CardGrid = () => {
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const setCardForm = useSetAtom(cardFormAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)
  const encryptionKey = useAtomValue(encryptionKeyAtom)
  const encryptionEnabled = useAtomValue(appConfigAtom)?.encryptionEnabled === true

  const { items, displayItems, searchQuery, typeFilter, tagFilter } = useCardSearch()

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

  const handleDuplicate = async (item: Item) => {
    try {
      // item.tags는 표시용으로 복호화된 값이다 — 그대로 저장하면 content만 암호문인
      // 반쪽짜리 카드가 된다. 저장 직전에 다시 암호화한다. LOCKED_TAG_LABEL은 실제
      // 태그가 아니라 "복호화 못한 원소가 있었다"는 표시일 뿐이므로, 복제본에 실데이터로
      // 영구 저장되지 않도록 제외한다(원본 암호문은 어차피 복제할 수 없으므로 유실은
      // 이미 확정된 상태 — 라벨을 지우지 않으면 그 사실이 가짜 태그로 둔갑한다).
      const visibleTags = item.tags.filter((t) => t !== LOCKED_TAG_LABEL)
      const duplicateTags = encryptionEnabled && encryptionKey
        ? await encryptTags([...visibleTags], encryptionKey)
        : [...visibleTags]
      const duplicate: Omit<Item, 'id'> = {
        folderId: item.folderId,
        title: `${item.title} (복사본)`,
        type: item.type,
        tags: duplicateTags,
        order: Date.now(),
        pinned: false,
        content: item.content,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      }
      await db.items.add(duplicate)
      toast.success(`"${item.title}" 복제됨`, { duration: 2000 })
    } catch (err) {
      toast.error(`복제 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    }
  }

  const handleAddCard = () => {
    setCardForm({ isOpen: true, editItem: null, folderId: selectedFolder })
  }

  // ── Drag & Drop ───────────────────────────────────────────────
  const [dragItemId, setDragItemId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  // 검색 활성 시 DnD 비활성 (Fuse 결과는 관련도 순이라 order 의미 없음)
  const isDndEnabled = !searchQuery.trim()

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, itemId: number) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragItemId(itemId)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragItemId(null)
    setDragOverId(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, itemId: number) => {
    // OS 파일을 카드 위로 끄는 경우(전역 드롭존 대상) — 카드 순서변경 인디케이터를
    // 띄우면 안 된다. preventDefault를 호출하지 않고 그대로 반환해 이벤트가 window의
    // 전역 드롭존 리스너까지 버블링되도록 둔다.
    if (e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(itemId)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>, targetItemId: number) => {
    // OS 파일 드롭은 이 핸들러의 대상이 아니다 — 전역 드롭존(GlobalFileDropZone)이 처리한다.
    if (e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    if (dragItemId === null || dragItemId === targetItemId || !items) {
      setDragItemId(null)
      setDragOverId(null)
      return
    }

    // items는 DB에서 order 기준 정렬된 전체 목록
    const allItems = [...items]
    const fromIndex = allItems.findIndex((it) => it.id === dragItemId)
    const toIndex = allItems.findIndex((it) => it.id === targetItemId)

    if (fromIndex === -1 || toIndex === -1) {
      setDragItemId(null)
      setDragOverId(null)
      return
    }

    const [moved] = allItems.splice(fromIndex, 1)
    allItems.splice(toIndex, 0, moved)

    // items는 표시용으로 tags가 복호화된 사본이다 — 전체 행을 bulkPut하면
    // 화면에 보이던 모든 카드의 태그가 평문으로 DB에 덮어써진다. order만 쓴다.
    const updates = allItems.map((it, index) => ({ key: it.id, changes: { order: index } }))
    try {
      await db.items.bulkUpdate(updates)
    } catch (err) {
      toast.error(`순서 변경 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    }

    setDragItemId(null)
    setDragOverId(null)
  }, [dragItemId, items])

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
            onDuplicate={(i) => void handleDuplicate(i)}
            draggable={isDndEnabled}
            isDragging={dragItemId === item.id}
            isDragOver={dragOverId === item.id && dragItemId !== item.id}
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, item.id)}
            onDrop={(e) => void handleDrop(e, item.id)}
          />
        ))}
      </div>
    </div>
  )
}
