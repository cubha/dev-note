// src/shared/components/ConfirmHost.tsx
//
// useConfirm()이 올린 확인 요청을 실제로 렌더하는 단일 호스트. App 루트에 1회만 마운트한다.
// 취소·Escape·백드롭·헤더 X 등 **모든 dismiss 경로가 settle(false)로 모이게** 하는 것이
// 이 컴포넌트의 핵심 책임이다 — 하나라도 resolve 없이 atom만 비우면 호출부의 await가
// 에러도 로그도 없이 영원히 멈춘다.

import { useAtom } from 'jotai'
import { confirmRequestAtom } from '../../store/atoms'
import { ConfirmDialog } from './ConfirmDialog'

export const ConfirmHost = () => {
  const [request, setRequest] = useAtom(confirmRequestAtom)

  if (!request) return null

  const settle = (confirmed: boolean) => {
    request.resolve(confirmed)
    setRequest(null)
  }

  return (
    <ConfirmDialog
      title={request.title}
      onClose={() => settle(false)}
      actions={[
        { label: request.cancelLabel ?? '취소', tone: 'cancel', onClick: () => settle(false) },
        {
          label: request.confirmLabel ?? '확인',
          tone: request.destructive ? 'destructive' : 'primary',
          onClick: () => settle(true),
        },
      ]}
    >
      {request.message}
    </ConfirmDialog>
  )
}
