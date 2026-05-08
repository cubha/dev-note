// src/features/sidebar/MoveToFolderModal.tsx

import { useLiveQuery } from 'dexie-react-hooks'
import { Folder, FolderOpen } from 'lucide-react'
import { db } from '../../core/db'
import { moveItemsToFolder } from './treeUtils'
import { Modal } from '../../shared/components/Modal'
import { ModalHeader } from '../../shared/components/ModalHeader'

interface MoveToFolderModalProps {
  selectedIds: number[]
  onClose: () => void
  onMoved: () => void
}

export const MoveToFolderModal = ({
  selectedIds,
  onClose,
  onMoved,
}: MoveToFolderModalProps) => {
  const folders = useLiveQuery(() => db.folders.orderBy('order').toArray(), [])
  const items = useLiveQuery(() => db.items.orderBy('order').toArray(), [])

  const handleMoveToFolder = async (targetFolderId: number) => {
    if (!items) return
    await moveItemsToFolder(items, selectedIds, targetFolderId)
    onMoved()
    onClose()
  }

  const handleMoveToRoot = async () => {
    await db.items.where('id').anyOf(selectedIds).modify({ folderId: null })
    onMoved()
    onClose()
  }

  return (
    <Modal
      onClose={onClose}
      width="w-[360px]"
      maxHeight="max-h-[70vh]"
      ariaLabel="폴더 이동"
    >
      <ModalHeader
        title="폴더 이동"
        icon={<FolderOpen size={16} className="text-[var(--text-secondary)]" />}
        onClose={onClose}
      />

      <div className="flex flex-col gap-1 overflow-y-auto p-2">
        {/* 루트 옵션 */}
        <button
          type="button"
          onClick={handleMoveToRoot}
          className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer bg-transparent border-none"
        >
          <Folder size={15} className="shrink-0 text-[var(--text-tertiary)]" />
          <span>루트 (폴더 없음)</span>
        </button>

        {folders === undefined ? (
          <div className="px-3 py-2 text-xs text-[var(--text-secondary)]">로딩 중...</div>
        ) : folders.length === 0 ? (
          <div className="px-3 py-2 text-xs text-[var(--text-secondary)]">폴더가 없습니다</div>
        ) : (
          folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => handleMoveToFolder(folder.id)}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-left text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer bg-transparent border-none"
            >
              <Folder size={15} className="shrink-0 text-[var(--text-tertiary)]" />
              <span className="truncate">{folder.name}</span>
            </button>
          ))
        )}
      </div>

      <div className="border-t border-[var(--border-default)] p-3">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded px-3 py-1.5 text-xs text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer bg-transparent"
        >
          취소
        </button>
      </div>
    </Modal>
  )
}
