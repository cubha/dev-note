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
import { saveIfActive, suppressNextFlush, bumpDraftEpoch } from '../../features/cards/draftFlushControl'
import { ConfirmDialog } from './ConfirmDialog'

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
    // 탭전환 cleanup-flush가 방금 지울 드래프트를 되살리지 않도록 먼저 억제.
    // bumpDraftEpoch는 그와 별개로 "이미 in-flight인" 암호화 flush(encrypt await 중)까지
    // 잡아낸다 — suppressNextFlush는 이후에 새로 시작되는 flush만 막을 수 있다.
    pending.dirtyTabIds.forEach((id) => {
      suppressNextFlush(id)
      bumpDraftEpoch(id)
    })
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

  // 셸은 공용 ConfirmDialog — 다른 확인 대화상자와 크기가 같고, 저장 중 라벨 변경("저장"→"저장 중...")이나
  // 탭 개수 단복수 문구로도 크기가 변하지 않는다. 핸들러·가드(saving 중 취소 차단, enableEsc={!saving})는
  // 이전과 동일하다 — phantom close 레이스 방지 로직이라 건드리지 않는다.
  return (
    <ConfirmDialog
      title="닫기 전 확인"
      ariaLabel="미저장 변경사항 확인"
      onClose={handleCancel}
      enableEsc={!saving}
      actions={[
        { label: '취소', tone: 'cancel', onClick: handleCancel, disabled: saving },
        { label: '저장 안 함', tone: 'danger', onClick: () => void handleDiscard(), disabled: saving },
        {
          label: saving ? '저장 중...' : '저장',
          tone: 'primary',
          onClick: () => void handleSaveAndClose(),
          disabled: saving,
        },
      ]}
    >
      {message} 저장하지 않고 닫으면 변경사항이 사라집니다.
    </ConfirmDialog>
  )
}
