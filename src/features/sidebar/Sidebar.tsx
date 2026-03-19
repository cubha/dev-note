// src/features/sidebar/Sidebar.tsx

import { useEffect, useMemo, useState } from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { db } from '../../core/db'
import {
  settingsOpenAtom,
  dragOverFolderAtom,
  expandedFoldersAtom,
  selectedItemsAtom,
  flatVisibleItemIdsAtom,
  appConfigAtom,
  cardFormAtom,
  selectedFolderAtom,
  activeTabAtom,
  sidebarCollapsedAtom,
  openTabsAtom,
  dirtyItemsAtom,
} from '../../store/atoms'
import { buildTree, getRootItems, getFlatVisibleItemIds } from './treeUtils'
import { SortableItemRow, SortableFolderNode } from './TreeNode'
import { StorageButtons } from '../storage/StorageButtons'
import { removeItemsFromState } from '../../store/tabHelpers'

export function Sidebar() {
  const setCardForm = useSetAtom(cardFormAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const [selectedFolder, setSelectedFolder] = useAtom(selectedFolderAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const setSidebarCollapsed = useSetAtom(sidebarCollapsedAtom)
  const setDragOverFolder = useSetAtom(dragOverFolderAtom)
  const [selectedItems, setSelectedItems] = useAtom(selectedItemsAtom)
  const setFlatVisibleItemIds = useSetAtom(flatVisibleItemIdsAtom)
  const expanded = useAtomValue(expandedFoldersAtom)
  const [config, setConfig] = useAtom(appConfigAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)

  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const handleThemeToggle = async () => {
    if (!config) return
    const next: 'dark' | 'light' = config.theme === 'dark' ? 'light' : 'dark'
    setConfig((prev) => (prev ? { ...prev, theme: next } : prev))
    await db.config.update(1, { theme: next })
  }

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

  // ─── flatVisibleItemIds 동기화 (Shift+Click 범위 선택용) ───────
  useEffect(() => {
    const flat = getFlatVisibleItemIds(treeNodes, rootItems, expanded)
    setFlatVisibleItemIds(flat)
  }, [treeNodes, rootItems, expanded, setFlatVisibleItemIds])

  // ─── 선택 해제 시 confirm 상태 초기화 ─────────────────────────
  useEffect(() => {
    if (selectedItems.size === 0) setConfirmingDelete(false)
  }, [selectedItems.size])

  // ─── DnD 센서 설정 ────────────────────────────────────────────
  // distance: 5px — 클릭과 드래그 구분
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  // ─── DnD Over 핸들러 (드롭 대상 폴더 hover highlight) ─────────
  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (over && (over.id as string).startsWith('f-')) {
      setDragOverFolder(parseInt((over.id as string).slice(2)))
    } else {
      setDragOverFolder(null)
    }
  }

  // ─── DnD 완료 핸들러 ──────────────────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    setDragOverFolder(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    if (!items || !folders) return

    const activeId = active.id as string
    const overId = over.id as string

    const activeIsItem = activeId.startsWith('i-')
    const activeIsFolder = activeId.startsWith('f-')
    const overIsItem = overId.startsWith('i-')
    const overIsFolder = overId.startsWith('f-')

    // ── Case 1: 항목 → 폴더로 드롭 (폴더 간 이동) ────────────────
    if (activeIsItem && overIsFolder) {
      const activeItemId = parseInt(activeId.slice(2))
      const overFolderId = parseInt(overId.slice(2))

      // 다중 선택 여부: 드래그 항목이 선택 집합에 포함되고 2개 이상 선택
      const isMultiDrag = selectedItems.has(activeItemId) && selectedItems.size > 1
      const idsToMove = isMultiDrag ? Array.from(selectedItems) : [activeItemId]

      // 이미 대상 폴더에 있는 항목 제외
      const itemsToMove = items.filter(
        (i) => i.id !== undefined && idsToMove.includes(i.id) && i.folderId !== overFolderId,
      )
      if (itemsToMove.length === 0) return

      const targetFolderItems = items.filter((i) => i.folderId === overFolderId)
      const baseOrder = targetFolderItems.length > 0
        ? Math.max(...targetFolderItems.map((i) => i.order)) + 1000
        : 1000

      await db.items.bulkPut(
        itemsToMove.map((item, idx) => ({
          ...item,
          folderId: overFolderId,
          order: baseOrder + idx * 1000,
        })),
      )
      return
    }

    // ── Case 2: 항목 → 항목으로 드롭 ─────────────────────────────
    if (activeIsItem && overIsItem) {
      const activeItemId = parseInt(activeId.slice(2))
      const overItemId = parseInt(overId.slice(2))
      const activeItem = items.find((i) => i.id === activeItemId)
      const overItem = items.find((i) => i.id === overItemId)
      if (!activeItem || !overItem) return

      const isMultiDrag = selectedItems.has(activeItemId) && selectedItems.size > 1

      if (isMultiDrag) {
        // 다중 드래그: 선택된 항목 전체를 overItem의 폴더로 이동, overItem 위치에 삽입
        const idsToMove = Array.from(selectedItems)
        const itemsToMove = items.filter(
          (i) => i.id !== undefined && idsToMove.includes(i.id),
        )

        await db.transaction('rw', db.items, async () => {
          // overItem의 폴더 내 항목 목록 (이동 대상 제외)
          const targetGroup = items
            .filter(
              (i) => i.folderId === overItem.folderId && !idsToMove.includes(i.id),
            )
            .sort((a, b) => a.order - b.order)

          const overIdx = targetGroup.findIndex((i) => i.id === overItemId)
          const insertAt = overIdx === -1 ? targetGroup.length : overIdx

          // targetGroup의 overIdx 위치에 이동 항목들을 삽입
          const newGroup = [...targetGroup]
          const movedWithNewFolder = itemsToMove.map((i) => ({
            ...i,
            folderId: overItem.folderId,
          }))
          newGroup.splice(insertAt, 0, ...movedWithNewFolder)

          await db.items.bulkPut(
            newGroup.map((item, idx) => ({ ...item, order: (idx + 1) * 1000 })),
          )
        })
      } else if (activeItem.folderId === overItem.folderId) {
        // 단일: 같은 폴더 내 순서 변경
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
      } else {
        // 단일: 다른 폴더의 항목 위로 드롭 → overItem의 폴더로 이동, 해당 위치에 삽입
        await db.transaction('rw', db.items, async () => {
          const movedItem = { ...activeItem, folderId: overItem.folderId }
          const targetGroup = items
            .filter((i) => i.folderId === overItem.folderId)
            .sort((a, b) => a.order - b.order)

          const overIdx = targetGroup.findIndex((i) => i.id === overItemId)
          const newGroup = [...targetGroup]
          newGroup.splice(overIdx, 0, movedItem)

          await db.items.bulkPut(
            newGroup.map((item, idx) => ({ ...item, order: (idx + 1) * 1000 })),
          )
        })
      }
      return
    }

    // ── Case 3: 폴더 → 폴더로 드롭 (같은 parent 내 순서 변경) ────
    if (activeIsFolder && overIsFolder) {
      const activeFolderId = parseInt(activeId.slice(2))
      const overFolderId = parseInt(overId.slice(2))
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

  const handleNewItem = () => {
    setCardForm({ isOpen: true, editItem: null, folderId: selectedFolder })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedItems)
    removeItemsFromState(ids, setOpenTabs, setActiveTab, setDirtyItems)
    setSelectedItems(new Set<number>())
    setConfirmingDelete(false)
    await db.items.bulkDelete(ids)
  }

  return (
    <aside className="flex w-[var(--sidebar-width)] shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-sidebar)]">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-[var(--border-default)] bg-[var(--bg-sidebar)] p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setSelectedFolder(null); setActiveTab(null) }}
            className="flex items-center gap-2 cursor-pointer bg-transparent border-none p-0 hover:opacity-70 transition-opacity"
            title="메인 화면으로 이동"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)]">
              <span className="text-xs font-bold text-white">D</span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              DevNote
            </span>
          </button>
          <div className="flex items-center gap-0.5">
            {/* 테마 토글 버튼 */}
            <button
              type="button"
              onClick={handleThemeToggle}
              className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
              title={config?.theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              aria-label={config?.theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {config?.theme === 'dark' ? (
                // 태양 아이콘 (라이트로 전환)
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                // 달 아이콘 (다크로 전환)
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>

            {/* 환경설정 버튼 */}
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
              title="환경설정"
              aria-label="환경설정"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <line x1="4" y1="6" x2="20" y2="6" />
                <circle cx="15" cy="6" r="2" fill="currentColor" stroke="none" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <circle cx="9" cy="12" r="2" fill="currentColor" stroke="none" />
                <line x1="4" y1="18" x2="20" y2="18" />
                <circle cx="16" cy="18" r="2" fill="currentColor" stroke="none" />
              </svg>
            </button>

            {/* 사이드바 접기 버튼 */}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
              title="사이드바 접기"
              aria-label="사이드바 접기"
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M15 18l-6-6 6-6" />
                <path d="M4 4v16" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleNewItem}
            className="flex items-center justify-center rounded p-1.5 text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
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
            className="flex items-center justify-center rounded p-1.5 text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]"
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

      {/* 전체 보기 + 폴더 트리 */}
      <div
        className="flex-1 overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedItems(new Set<number>())
          }
        }}
      >
        {/* 전체 보기 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedFolder(null)}
          onKeyDown={(e) => { if (e.key === 'Enter') setSelectedFolder(null) }}
          className={`flex h-7 cursor-pointer items-center gap-2 px-3 text-xs font-medium uppercase tracking-wider ${
            selectedFolder === null
              ? 'bg-[var(--bg-item-active)] text-[var(--text-on-active)]'
              : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <span>전체 카드</span>
          {items && <span className="ml-auto text-[10px] opacity-60">{items.length}</span>}
        </div>

        {folders === undefined || items === undefined ? (
          <div className="p-3 text-xs text-[var(--text-secondary)]">로딩 중...</div>
        ) : isEmpty ? (
          <div className="p-4 text-center text-sm text-[var(--text-tertiary)]">
            새 카드 버튼으로 시작하세요
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragOver={handleDragOver}
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

      {/* 다중 선택 액션 바 */}
      {selectedItems.size > 0 && (
        <div className="border-t border-[var(--border-default)] px-3 py-2">
          {confirmingDelete ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-[var(--text-secondary)] text-center">
                {selectedItems.size}개 카드를 삭제하시겠습니까?
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 rounded px-2 py-1 text-xs text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer bg-transparent"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="flex-1 rounded px-2 py-1 text-xs text-white bg-[var(--color-error,#ef4444)] hover:opacity-90 transition-opacity cursor-pointer border-none"
                >
                  삭제 확인
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--text-secondary)]">
                {selectedItems.size}개 선택됨
              </span>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--text-error)] hover:bg-[var(--bg-error-hover)] hover:text-white transition-colors cursor-pointer bg-transparent border-none"
              >
                <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                </svg>
                일괄 삭제
              </button>
            </div>
          )}
        </div>
      )}

      {/* 새 카드 추가 버튼 */}
      <div className="border-t border-[var(--border-default)] px-3 py-2">
        <button
          type="button"
          onClick={handleNewItem}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors cursor-pointer bg-transparent border-none"
        >
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          새 카드 추가
        </button>
      </div>

      <StorageButtons />
    </aside>
  )
}
