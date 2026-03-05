// src/features/sidebar/TreeNode.tsx

import { useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { DraggableAttributes } from '@dnd-kit/core'

// useSortable의 listeners 타입을 ReturnType에서 추출 (내부 타입 직접 import 불필요)
type SyntheticListenerMap = ReturnType<typeof useSortable>['listeners']
import type { Item, ItemType } from '../../core/db'
import { db } from '../../core/db'
import type { FolderNode } from './treeUtils'
import {
  activeTabAtom,
  contextMenuAtom,
  expandedFoldersAtom,
  openTabsAtom,
  renamingTargetAtom,
  selectedFolderAtom,
} from '../../store/atoms'

const MENU_WIDTH = 192

// ─── DragHandle ──────────────────────────────────────────────

interface DragHandleProps {
  dragHandleRef?: (node: HTMLElement | null) => void
  dragListeners?: SyntheticListenerMap
  dragAttributes?: DraggableAttributes
}

function DragHandle({ dragHandleRef, dragListeners, dragAttributes }: DragHandleProps) {
  if (!dragListeners) return null
  return (
    <span
      ref={dragHandleRef}
      {...dragAttributes}
      {...dragListeners}
      className="invisible flex shrink-0 cursor-grab items-center justify-center px-0.5 text-[#555] hover:text-[#888] active:cursor-grabbing group-hover/row:visible"
      aria-label="드래그 핸들"
      title="드래그하여 순서 변경"
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 6 14" className="size-2.5 fill-current" aria-hidden>
        <circle cx="1.5" cy="2" r="1.2" />
        <circle cx="4.5" cy="2" r="1.2" />
        <circle cx="1.5" cy="7" r="1.2" />
        <circle cx="4.5" cy="7" r="1.2" />
        <circle cx="1.5" cy="12" r="1.2" />
        <circle cx="4.5" cy="12" r="1.2" />
      </svg>
    </span>
  )
}

// ─── TreeNode ────────────────────────────────────────────────

interface TreeNodeProps {
  node: FolderNode
  depth: number
  dragHandleRef?: (node: HTMLElement | null) => void
  dragListeners?: SyntheticListenerMap
  dragAttributes?: DraggableAttributes
  isDragging?: boolean
}

export function TreeNode({ node, depth, dragHandleRef, dragListeners, dragAttributes, isDragging }: TreeNodeProps) {
  const expanded = useAtomValue(expandedFoldersAtom)
  const setExpanded = useSetAtom(expandedFoldersAtom)
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const setSelectedFolder = useSetAtom(selectedFolderAtom)
  const renamingTarget = useAtomValue(renamingTargetAtom)
  const setRenamingTarget = useSetAtom(renamingTargetAtom)
  const setContextMenu = useSetAtom(contextMenuAtom)

  const inputRef = useRef<HTMLInputElement>(null)
  const skipSave = useRef(false)
  const { folder, children, items } = node
  const isRenaming =
    renamingTarget?.type === 'folder' && renamingTarget?.id === folder.id
  const isExpanded = expanded.has(folder.id)
  const hasContent = children.length > 0 || items.length > 0

  const handleFolderClick = () => {
    const next = new Set(expanded)
    if (next.has(folder.id)) {
      next.delete(folder.id)
    } else {
      next.add(folder.id)
    }
    setExpanded(next)
    setSelectedFolder(folder.id)
  }

  const isSelected = selectedFolder === folder.id

  // 폴더 아이템 SortableContext ID 목록
  const itemSortIds = items.map((i) => `i-${i.id}`)
  // 서브폴더 SortableContext ID 목록
  const childSortIds = children.map((c) => `f-${c.folder.id}`)

  return (
    <>
      <div
        className={`group/row flex h-7 cursor-pointer items-center gap-1.5 text-sm text-[#cccccc] hover:bg-[#2a2d2e] ${isSelected ? 'bg-[#37373d] text-white' : ''} ${isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${depth * 12}px` }}
      >
        <DragHandle
          dragHandleRef={dragHandleRef}
          dragListeners={dragListeners}
          dragAttributes={dragAttributes}
        />
        <div
          role="button"
          tabIndex={0}
          onClick={handleFolderClick}
          onDoubleClick={(e) => {
            e.stopPropagation()
            setRenamingTarget({ id: folder.id, type: 'folder' })
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const x =
              window.innerWidth - e.clientX < MENU_WIDTH
                ? e.clientX - MENU_WIDTH
                : e.clientX
            setContextMenu({
              isOpen: true,
              x,
              y: e.clientY,
              targetId: folder.id,
              type: 'folder',
            })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleFolderClick()
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden pr-2"
          aria-expanded={hasContent ? isExpanded : undefined}
        >
          <span
            className={`inline-flex size-4 shrink-0 items-center justify-center ${hasContent ? '' : 'invisible'}`}
            aria-hidden
          >
            {hasContent &&
              (isExpanded ? (
                <svg
                  viewBox="0 0 12 12"
                  className="size-3 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M3 5l3 3 3-6" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 12 12"
                  className="size-3 shrink-0 -rotate-90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M3 5l3 3 3-6" />
                </svg>
              ))}
          </span>
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M3 7v10a1 1 0 001 1h16a1 1 0 001-1V7a1 1 0 00-1-1H4a1 1 0 00-1 1z" />
            <path d="M3 7l9-4 9 4" />
          </svg>
          {isRenaming ? (
            <input
              key={`rename-folder-${folder.id}`}
              ref={inputRef}
              type="text"
              defaultValue={folder.name}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  skipSave.current = true
                  const trimmed = (inputRef.current?.value ?? '').trim()
                  if (trimmed) await db.folders.update(folder.id, { name: trimmed })
                  setRenamingTarget(null)
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  skipSave.current = true
                  setRenamingTarget(null)
                }
              }}
              onBlur={async () => {
                if (skipSave.current) {
                  skipSave.current = false
                  return
                }
                const trimmed = (inputRef.current?.value ?? '').trim()
                if (trimmed) await db.folders.update(folder.id, { name: trimmed })
                setRenamingTarget(null)
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              className="min-w-0 flex-1 rounded bg-[#3c3c3c] px-1 text-sm text-[#d4d4d4] outline-none focus:ring-1 focus:ring-[#007acc]"
            />
          ) : (
            <span className="min-w-0 truncate" title={folder.name}>
              {folder.name}
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <>
          {/* 폴더 내 아이템 정렬 */}
          <SortableContext items={itemSortIds} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableItemRow key={item.id} item={item} depth={depth} />
            ))}
          </SortableContext>
          {/* 서브폴더 정렬 */}
          <SortableContext items={childSortIds} strategy={verticalListSortingStrategy}>
            {children.map((child) => (
              <SortableFolderNode key={child.folder.id} node={child} depth={depth + 1} />
            ))}
          </SortableContext>
        </>
      )}
    </>
  )
}

// ─── SortableFolderNode ───────────────────────────────────────

export function SortableFolderNode({ node, depth }: { node: FolderNode; depth: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `f-${node.folder.id}` })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <TreeNode
        node={node}
        depth={depth}
        dragHandleRef={setActivatorNodeRef}
        dragListeners={listeners}
        dragAttributes={attributes}
        isDragging={isDragging}
      />
    </div>
  )
}

// ─── ItemRow ──────────────────────────────────────────────────

interface ItemRowProps {
  item: Item
  depth: number
  dragHandleRef?: (node: HTMLElement | null) => void
  dragListeners?: SyntheticListenerMap
  dragAttributes?: DraggableAttributes
  isDragging?: boolean
}

const TYPE_BADGE: Record<
  ItemType,
  { label: string; className: string }
> = {
  ssh: { label: 'SSH', className: 'bg-[#264f78] text-[#9cdcfe]' },
  db: { label: 'DB', className: 'bg-[#3a2d20] text-[#ce9178]' },
  http: { label: 'HTTP', className: 'bg-[#1e3a1e] text-[#4ec9b0]' },
  note: { label: 'TXT', className: 'bg-[#2d2d2d] text-[#858585]' },
  custom: { label: 'ETC', className: 'bg-[#2d2d2d] text-[#858585]' },
}

export function ItemRow({ item, depth, dragHandleRef, dragListeners, dragAttributes, isDragging }: ItemRowProps) {
  const openTabs = useAtomValue(openTabsAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const setActiveTab = useSetAtom(activeTabAtom)
  const renamingTarget = useAtomValue(renamingTargetAtom)
  const setRenamingTarget = useSetAtom(renamingTargetAtom)
  const setContextMenu = useSetAtom(contextMenuAtom)

  const inputRef = useRef<HTMLInputElement>(null)
  const skipSave = useRef(false)
  const isRenaming =
    renamingTarget?.type === 'item' && renamingTarget?.id === item.id

  const isActive = activeTab === item.id

  const handleClick = () => {
    if (!openTabs.includes(item.id)) {
      setOpenTabs([...openTabs, item.id])
    }
    setActiveTab(item.id)
  }

  const badge = TYPE_BADGE[item.type]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setRenamingTarget({ id: item.id, type: 'item' })
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const x =
          window.innerWidth - e.clientX < MENU_WIDTH
            ? e.clientX - MENU_WIDTH
            : e.clientX
        setContextMenu({
          isOpen: true,
          x,
          y: e.clientY,
          targetId: item.id,
          type: 'item',
        })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      className={`group/row flex h-7 cursor-pointer items-center gap-1.5 text-sm text-[#cccccc] hover:bg-[#2a2d2e] ${isActive ? 'bg-[#094771] text-white' : ''} ${isDragging ? 'opacity-40' : ''}`}
      style={{ paddingLeft: `${(depth + 1) * 12}px` }}
    >
      <DragHandle
        dragHandleRef={dragHandleRef}
        dragListeners={dragListeners}
        dragAttributes={dragAttributes}
      />
      <span
        className={`shrink-0 rounded px-1 text-[10px] font-medium ${badge.className}`}
      >
        {badge.label}
      </span>
      {isRenaming ? (
        <input
          key={`rename-item-${item.id}`}
          ref={inputRef}
          type="text"
          defaultValue={item.title}
          onKeyDown={async (e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              skipSave.current = true
              const trimmed = (inputRef.current?.value ?? '').trim()
              if (trimmed) await db.items.update(item.id, { title: trimmed })
              setRenamingTarget(null)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              skipSave.current = true
              setRenamingTarget(null)
            }
          }}
          onBlur={async () => {
            if (skipSave.current) {
              skipSave.current = false
              return
            }
            const trimmed = (inputRef.current?.value ?? '').trim()
            if (trimmed) await db.items.update(item.id, { title: trimmed })
            setRenamingTarget(null)
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="min-w-0 flex-1 rounded bg-[#3c3c3c] px-1 text-sm text-[#d4d4d4] outline-none focus:ring-1 focus:ring-[#007acc]"
        />
      ) : (
        <span className="min-w-0 truncate" title={item.title}>
          {item.title}
        </span>
      )}
    </div>
  )
}

// ─── SortableItemRow ──────────────────────────────────────────

export function SortableItemRow({ item, depth }: { item: Item; depth: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `i-${item.id}` })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <ItemRow
        item={item}
        depth={depth}
        dragHandleRef={setActivatorNodeRef}
        dragListeners={listeners}
        dragAttributes={attributes}
        isDragging={isDragging}
      />
    </div>
  )
}
