// src/shared/hooks/useConfirm.ts
//
// window.confirm 대체 — Promise<boolean>을 돌려주므로 기존 호출부의
// `const ok = window.confirm(...); if (!ok) return` 형태를 `await confirm({...})`로
// 거의 그대로 옮길 수 있다. 실제 렌더는 App 루트의 <ConfirmHost />가 담당한다.
//
//   const confirm = useConfirm()
//   if (!(await confirm({ title: '항목 삭제', message: '...', destructive: true }))) return

import { useCallback } from 'react'
import { useSetAtom } from 'jotai'
import { confirmRequestAtom, type ConfirmOptions } from '../../store/atoms'

export const useConfirm = () => {
  const setRequest = useSetAtom(confirmRequestAtom)

  return useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest((prev) => {
          // 이미 대기 중인 요청이 있는데 새 요청이 들어오면 이전 것은 화면에서 사라진다.
          // 그대로 두면 이전 호출부의 await가 영원히 안 풀리므로 취소로 종결시킨다.
          // (jotai의 primitive atom updater는 React useState와 달리 1회만 호출된다)
          prev?.resolve(false)
          return { ...options, resolve }
        })
      }),
    [setRequest],
  )
}
