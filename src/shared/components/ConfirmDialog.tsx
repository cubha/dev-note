// src/shared/components/ConfirmDialog.tsx
//
// 확인/경고 대화상자의 **공용 셸**(presentational). 브라우저 기본 alert·confirm을 대신하는
// 앱 표준 UI이며, 이 파일이 "모든 확인 대화상자는 같은 크기" 규약의 유일한 강제 지점이다.
//
// 고정 레이아웃 규약 (docs/design/DESIGN-TOKENS.md「고정 레이아웃 규약」)
// - 대화상자: --modal-w-md × --modal-h-confirm 로 **높이까지 고정**. 본문이 길면 대화상자가
//   커지는 게 아니라 본문 영역만 스크롤한다.
// - 버튼: children으로 받지 않고 actions[]로 받아 여기서 직접 렌더한다. 호출부가 임의 크기의
//   버튼을 넣을 수 없어야 규약이 깨지지 않기 때문이다. 폭·높이를 토큰으로 고정하므로
//   라벨이 바뀌어도("저장"→"저장 중...") 레이아웃이 움직이지 않는다.
//
// 상태(boolean 응답)를 다루는 상위 레이어는 useConfirm + ConfirmHost 쪽이다.
// 이 컴포넌트는 3버튼(저장/저장 안 함/취소)처럼 boolean이 아닌 확인에도 그대로 쓰인다.

import { Modal } from './Modal'
import { ModalHeader } from './ModalHeader'
import { Button } from './Button'

/** 확인 대화상자 버튼 1개. tone이 시각 위계를 결정한다(색만 다르고 크기는 전부 동일). */
export interface ConfirmAction {
  label: string
  onClick: () => void
  /**
   * - `cancel`: 취소 등 중립 액션
   * - `primary`: 긍정 주 액션(저장·확인)
   * - `destructive`: 파괴가 **주 액션**일 때(삭제 확인) — 솔리드 채움
   * - `danger`: 파괴적이지만 주 액션이 아닐 때(저장 안 함) — 옅은 틴트
   */
  tone: 'cancel' | 'primary' | 'destructive' | 'danger'
  disabled?: boolean
}

const toneVariant = {
  cancel: 'secondary',
  primary: 'primary',
  destructive: 'destructive',
  danger: 'danger',
} as const

interface ConfirmDialogProps {
  title: string
  /** 본문. 길면 대화상자가 커지지 않고 이 영역이 스크롤된다. */
  children: React.ReactNode
  /** 왼쪽→오른쪽 순서로 렌더된다. 주 액션을 마지막에 둔다. */
  actions: ConfirmAction[]
  /** 취소로 간주되는 모든 dismiss 경로(Escape·백드롭·헤더 X)가 여기로 모인다. */
  onClose: () => void
  enableEsc?: boolean
  ariaLabel?: string
}

export const ConfirmDialog = ({
  title,
  children,
  actions,
  onClose,
  enableEsc = true,
  ariaLabel,
}: ConfirmDialogProps) => (
  <Modal
    onClose={onClose}
    width="w-[var(--modal-w-md)]"
    className="h-[var(--modal-h-confirm)]"
    elevated
    enableEsc={enableEsc}
    ariaLabel={ariaLabel ?? title}
  >
    <ModalHeader title={title} onClose={onClose} />

    {/* flex-1 + overflow-y-auto: 셸 높이가 고정이므로 넘치는 본문은 여기서 흡수된다 */}
    <div className="flex-1 overflow-y-auto px-5 py-4 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-line">
      {children}
    </div>

    <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-default)] px-5 py-3">
      {/* key는 label이 아니라 index — 라벨이 바뀌는 버튼("저장"→"저장 중...")이 remount되지 않게 */}
      {actions.map((action, i) => (
        <Button
          key={i}
          variant={toneVariant[action.tone]}
          size="sm"
          onClick={action.onClick}
          disabled={action.disabled}
          // 폭·높이 고정 = 라벨 길이·variant 패딩 차이가 레이아웃에 영향을 주지 못하게 한다
          className="w-[var(--confirm-btn-w)] h-[var(--confirm-btn-h)] shrink-0"
        >
          {action.label}
        </Button>
      ))}
    </div>
  </Modal>
)
