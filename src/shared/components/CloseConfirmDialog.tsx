// src/shared/components/CloseConfirmDialog.tsx
//
// 명시적 탭 닫기(useGuardedTabClose)가 dirty 탭을 감지했을 때 뜨는 3버튼 confirm.
// 저장 / 저장 안 함(실제 폐기) / 취소. App 루트에 1회만 마운트한다.

import { useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { toast } from 'sonner'
import { pendingCloseAtom, appConfigAtom, encryptionKeyAtom } from '../../store/atoms'
import { useGuardedTabClose } from '../hooks/useGuardedTabClose'
import { deleteDrafts } from '../../core/draftStore'
import { commitDraftToItem } from '../../features/cards/draftCommit'
import { saveIfActive, suppressNextFlush } from '../../features/cards/draftFlushControl'
import { Modal } from './Modal'
import { ModalHeader } from './ModalHeader'
import { Button } from './Button'

export const CloseConfirmDialog = () => {
  const [pending, setPendingClose] = useAtom(pendingCloseAtom)
  const { executeClose } = useGuardedTabClose()
  const config = useAtomValue(appConfigAtom)
  const encryptionKey = useAtomValue(encryptionKeyAtom)
  const encryptionEnabled = config?.encryptionEnabled ?? false
  const [saving, setSaving] = useState(false)

  if (!pending) return null

  // saving 중엔 취소를 막는다 — 안 막으면 저장 루프(각 id별 await)가 백그라운드에서
  // 계속 진행돼 "취소했는데 잠시 후 탭이 닫히는" phantom close가 된다(scope-critic 지적).
  // enableEsc={!saving}은 Escape만 막고 backdrop 클릭은 못 막으므로 onClose 쪽도 같이 가드해야 한다.
  const handleCancel = () => {
    if (saving) return
    setPendingClose(null)
  }

  const handleDiscard = async () => {
    // 탭전환 cleanup-flush가 방금 지울 드래프트를 되살리지 않도록 먼저 억제
    pending.dirtyTabIds.forEach((id) => suppressNextFlush(id))
    // delete 완료를 기다린 뒤 executeClose(→dirtyItemsAtom 정리) — 순서를 반대로 하면 DraftDirtySync의
    // useLiveQuery가 삭제 완료 전 시점(다른 탭의 무관한 drafts 쓰기로 재발화)의 stale 목록을 읽어
    // 이미 닫은 탭을 다시 dirty로 되살리는 레이스가 생긴다(scope-critic SubTask8 지적).
    await deleteDrafts(pending.dirtyTabIds)
    executeClose(pending.kind, pending.tabId)
    setPendingClose(null)
  }

  const handleSaveAndClose = async () => {
    setSaving(true)
    try {
      for (const id of pending.dirtyTabIds) {
        suppressNextFlush(id)
        // 활성 탭이면 컴포넌트의 handleSave로 위임(dirtyRef 동기 리셋 포함) —
        // commitDraftToItem을 활성 탭에 직접 쓰면 디바운스 effect가 드래프트를 되살리는 레이스가 있다.
        const handledByActive = await saveIfActive(id)
        if (!handledByActive) {
          await commitDraftToItem(id, encryptionEnabled, encryptionKey)
        }
      }
      executeClose(pending.kind, pending.tabId)
      setPendingClose(null)
    } catch (err) {
      toast.error(`저장 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`, { duration: 3000 })
    } finally {
      setSaving(false)
    }
  }

  const count = pending.dirtyTabIds.length
  const message = count === 1
    ? '이 탭에 저장하지 않은 변경사항이 있습니다.'
    : `저장하지 않은 변경사항이 있는 탭이 ${count}개 있습니다.`

  return (
    <Modal onClose={handleCancel} width="w-[420px]" ariaLabel="미저장 변경사항 확인" elevated enableEsc={!saving}>
      <ModalHeader title="닫기 전 확인" onClose={handleCancel} />
      <div className="p-5 space-y-4">
        <p className="text-xs text-[var(--text-secondary)]">
          {message} 저장하지 않고 닫으면 변경사항이 사라집니다.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
            취소
          </Button>
          <Button variant="danger" size="sm" onClick={() => void handleDiscard()} disabled={saving}>
            저장 안 함
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleSaveAndClose()} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
