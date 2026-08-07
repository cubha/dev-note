// src/shared/hooks/useDecryptedFolders.ts
//
// 폴더 목록을 읽어 이름을 복호화해 돌려준다. 폴더를 표시하는 곳이 4군데(사이드바 트리·
// 이동 모달·탭 컨텍스트메뉴·카드 컨텍스트메뉴)라 각자 복호화하면 같은 코드가 네 번 생긴다.
//
// 반환 객체는 name만 교체한 사본이다 — 이 값을 그대로 다시 저장하면 평문이 새므로,
// 쓰기 경로는 반드시 encryptFolderName을 거쳐야 한다.

import { useLiveQuery } from 'dexie-react-hooks'
import { useAtomValue } from 'jotai'
import { db } from '../../core/db'
import type { Folder } from '../../core/db'
import { decryptFolderName } from '../../core/metaCrypto'
import { encryptionKeyAtom } from '../../store/atoms'

export function useDecryptedFolders(): Folder[] | undefined {
  const encryptionKey = useAtomValue(encryptionKeyAtom)
  return useLiveQuery(async () => {
    const rows = await db.folders.orderBy('order').toArray()
    return Promise.all(
      rows.map(async (f) => ({ ...f, name: await decryptFolderName(f.name, encryptionKey) })),
    )
  }, [encryptionKey])
}
