// src/features/sidebar/Sidebar.tsx

import { useEffect, useMemo, useState } from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast } from 'sonner'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { db } from '../../core/db'
import { isDraft } from '../../core/cardState'
import { useDecryptedFolders } from '../../shared/hooks/useDecryptedFolders'
import { useConfirm } from '../../shared/hooks/useConfirm'
import { createFolder } from '../../core/metaStore'
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
  encryptionKeyAtom,
} from '../../store/atoms'
import { buildTree, getRootItems, getFlatVisibleItemIds, moveItemsToFolder, reorderItems, reorderFolders } from './treeUtils'
import { DEFAULT_FOLDER_NAME } from '../../shared/constants'
import { SortableItemRow, SortableFolderNode } from './TreeNode'
import { StorageButtons } from '../storage/StorageButtons'
import { exportSelectedAsMarkdown } from '../storage/exportMarkdown'
import { removeItemsFromState } from '../../store/tabHelpers'
import { IconButton } from '../../shared/components/IconButton'
import { MoveToFolderModal } from './MoveToFolderModal'
import { SidebarResizeHandle } from './SidebarResizeHandle'

export const Sidebar = () => {
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

  const [movingFolder, setMovingFolder] = useState(false)
  const confirm = useConfirm()

  const handleThemeToggle = async () => {
    if (!config) return
    const next: 'dark' | 'light' = config.theme === 'dark' ? 'light' : 'dark'
    setConfig((prev) => (prev ? { ...prev, theme: next } : prev))
    await db.config.update(1, { theme: next })
  }

  const folders = useDecryptedFolders()
  const encryptionKey = useAtomValue(encryptionKeyAtom)
  // draft(미저장 새 카드)는 트리에서 제외 — F1
  const items = useLiveQuery(
    () => db.items.orderBy('order').toArray().then((all) => all.filter((i) => !isDraft(i))),
    [],
  )

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

    if (activeIsItem && overIsFolder) {
      const activeItemId = parseInt(activeId.slice(2), 10)
      const overFolderId = parseInt(overId.slice(2), 10)
      const isMultiDrag = selectedItems.has(activeItemId) && selectedItems.size > 1
      const idsToMove = isMultiDrag ? Array.from(selectedItems) : [activeItemId]
      await moveItemsToFolder(items, idsToMove, overFolderId)
    } else if (activeIsItem && overIsItem) {
      const activeItemId = parseInt(activeId.slice(2), 10)
      const overItemId = parseInt(overId.slice(2), 10)
      const isMultiDrag = selectedItems.has(activeItemId) && selectedItems.size > 1
      const selectedIds = isMultiDrag ? Array.from(selectedItems) : [activeItemId]
      await reorderItems(items, activeItemId, overItemId, selectedIds)
    } else if (activeIsFolder && overIsFolder) {
      const activeFolderId = parseInt(activeId.slice(2), 10)
      const overFolderId = parseInt(overId.slice(2), 10)
      await reorderFolders(folders, activeFolderId, overFolderId)
    }
  }

  // ─── SortableContext ID 목록 ───────────────────────────────────
  const rootItemSortIds = rootItems.map((i) => `i-${i.id}`)
  const rootFolderSortIds = treeNodes.map((n) => `f-${n.folder.id}`)

  // ─── 새 항목 / 폴더 생성 ──────────────────────────────────────
  const handleNewFolder = async () => {
    await createFolder(null, DEFAULT_FOLDER_NAME, encryptionKey)
  }

  const handleNewItem = () => {
    setCardForm({ isOpen: true, editItem: null, folderId: selectedFolder })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedItems)
    // 확인은 공용 ConfirmDialog로 받는다. 예전에는 액션바 안에서 인라인으로 확인 UI를 펼쳤는데,
    // 그러면 클릭 한 번에 액션바가 1단→2단으로 커져(고정 레이아웃 규약 위반) 사이드바가 흔들렸다.
    const confirmed = await confirm({
      title: '카드 삭제',
      message: `${ids.length}개 카드를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: '삭제',
      destructive: true,
    })
    if (!confirmed) return
    setSelectedItems(new Set<number>())
    try {
      await db.items.bulkDelete(ids)
      removeItemsFromState(ids, setOpenTabs, setActiveTab, setDirtyItems)
    } catch (err) {
      toast.error(`삭제 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    }
  }

  const handleBulkExportMarkdown = async () => {
    const ids = Array.from(selectedItems)
    try {
      const { exported, skippedLocked } = await exportSelectedAsMarkdown(ids, encryptionKey)
      if (exported > 0) {
        toast.success(`${exported}개 카드를 md로 내보냈습니다`, { duration: 2500 })
      }
      if (skippedLocked > 0) {
        toast.warning(`잠긴 카드 ${skippedLocked}개는 건너뛰었습니다 — 잠금 해제 후 다시 시도해 주세요.`, { duration: 3500 })
      }
      if (exported === 0 && skippedLocked === 0) {
        toast.info('내보낼 카드가 없습니다.', { duration: 2000 })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error(`내보내기 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    }
  }

  return (
    <aside id="sidebar" className="relative flex w-[var(--sidebar-width)] shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-sidebar)]">
      <header className="sticky top-0 z-10 flex flex-col gap-2 border-b border-[var(--border-default)] bg-[var(--bg-sidebar)] p-3">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setSelectedFolder(null); setActiveTab(null) }}
            className="flex items-center gap-2 cursor-pointer bg-transparent border-none p-0 hover:opacity-70 transition-opacity"
            title="메인 화면으로 이동"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)]">
              <span className="text-xs font-bold text-[var(--text-on-solid)]">D</span>
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
              DevNote
            </span>
          </button>
          <div className="flex items-center gap-0.5">
            {/* 테마 토글 버튼 */}
            <IconButton
              icon={config?.theme === 'dark' ? (
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
              size="sm"
              tooltip={config?.theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              aria-pressed={config?.theme === 'dark'}
              aria-label={config?.theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              onClick={handleThemeToggle}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            />

            {/* 환경설정 버튼 */}
            <IconButton
              icon={
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <circle cx="15" cy="6" r="2" fill="currentColor" stroke="none" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <circle cx="9" cy="12" r="2" fill="currentColor" stroke="none" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                  <circle cx="16" cy="18" r="2" fill="currentColor" stroke="none" />
                </svg>
              }
              size="sm"
              tooltip="환경설정"
              onClick={() => setSettingsOpen(true)}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            />

            {/* 사이드바 접기 버튼 */}
            <IconButton
              icon={
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M15 18l-6-6 6-6" />
                  <path d="M4 4v16" />
                </svg>
              }
              size="sm"
              tooltip="사이드바 접기"
              aria-pressed={false}
              aria-label="사이드바 접기"
              onClick={() => setSidebarCollapsed(true)}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            />
          </div>
        </div>
        <div className="flex gap-1">
          <IconButton
            icon={
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            }
            size="md"
            tooltip="새 항목"
            onClick={handleNewItem}
            className="text-[var(--text-primary)]"
          />
          <IconButton
            icon={
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M3 7v10a1 1 0 001 1h16a1 1 0 001-1V7a1 1 0 00-1-1h-6l-2-2h-6a1 1 0 00-1 1z" />
                <path d="M12 11v6" />
                <path d="M9 14h6" />
              </svg>
            }
            size="md"
            tooltip="새 폴더"
            onClick={handleNewFolder}
            className="text-[var(--text-primary)]"
          />
        </div>
      </header>

      {/* 전체 보기 + 폴더 트리 */}
      <div
        role="tree"
        aria-label="폴더 트리"
        className="flex-1 overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedItems(new Set<number>())
          }
        }}
      >
        {/* 전체 보기 */}
        <div
          role="treeitem"
          aria-selected={selectedFolder === null}
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
          {items && <span className="ml-auto text-[var(--font-3xs)] opacity-60">{items.length}</span>}
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

      {/* 다중 선택 액션 바 — 선택 중에만 나타나는 패널이라 사이드바 상시 영역(새 카드 추가)과
          같은 스타일이면 눈에 띄지 않는다. accent 계열 배경 + 상단 accent 보더로 분리한다.
          라벨은 별도 줄로 올려 좁은 사이드바 폭(기본 260px)에서 버튼 라벨이 접히지 않게 한다. */}
      {selectedItems.size > 0 && (
        <div className="border-t-2 border-[var(--border-accent)] bg-[var(--bg-item-active)] px-3 py-2">
          <div className="mb-1.5 text-[var(--font-2xs)] font-medium text-[var(--text-secondary)]">
            {selectedItems.size}개 선택됨
          </div>
          {/* 사이드바는 180px까지 좁아진다(SidebarResizeHandle MIN_WIDTH) — 그 폭에선 버튼 3개가
              한 줄에 안 들어간다. whitespace-nowrap은 라벨이 글자 단위로 접히는 것만 막을 뿐
              넘침을 막지 못하므로, 버튼 단위 줄바꿈(flex-wrap)으로 담는다. */}
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            <button
              type="button"
              onClick={() => setMovingFolder(true)}
              className="flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer bg-transparent border-none"
            >
              <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                <path d="M12 11v6" />
                <path d="M9 14l3-3 3 3" />
              </svg>
              이동
            </button>
            <button
              type="button"
              onClick={() => void handleBulkExportMarkdown()}
              className="flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer bg-transparent border-none"
              title="선택한 카드를 md로 내보내기"
            >
              <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 15V3" />
                <path d="M7 10l5 5 5-5" />
                <path d="M20 21H4" />
              </svg>
              md
            </button>
            <button
              type="button"
              onClick={() => void handleBulkDelete()}
              className="ml-auto flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs text-[var(--text-error)] hover:bg-[var(--bg-error-hover)] transition-colors cursor-pointer bg-transparent border-none"
            >
              <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
              </svg>
              일괄 삭제
            </button>
          </div>
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

      {movingFolder && (
        <MoveToFolderModal
          selectedIds={Array.from(selectedItems)}
          onClose={() => setMovingFolder(false)}
          onMoved={() => {
            setSelectedItems(new Set<number>())
            setMovingFolder(false)
          }}
        />
      )}

      <SidebarResizeHandle />
    </aside>
  )
}
