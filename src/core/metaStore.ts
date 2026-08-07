// src/core/metaStore.ts
//
// 태그·폴더명 메타데이터의 DB 일괄 변환 — 순수 로직(metaCrypto.ts)과 Dexie 접근을 분리한다
// (draft.ts / draftStore.ts와 같은 구조).
//
// 세 변환 모두 **평문·암호문 혼재 상태를 견뎌야 한다**. 백필이 DB 업그레이드가 아니라
// 잠금 해제 시점에 돌기 때문에, 중간에 앱이 닫히면 일부만 암호화된 채 남는다.
// 그래서 reencryptMeta도 "옛 키로 복호화" 대신 "복호화 시도 후 새 키로 암호화"로 동작해
// 평문으로 남아 있던 값까지 흡수한다 — 안 그러면 백필 누락분이 영구히 평문으로 남는다.

import { db } from './db'
import { encryptTags, decryptTags, encryptFolderName, decryptFolderName } from './metaCrypto'
import { isEncryptedContent } from './content'

/** 평문으로 남은 태그·폴더명을 암호화한다(멱등). 잠금 해제·암호화 활성 시 호출. */
export async function backfillMeta(key: CryptoKey): Promise<void> {
  const items = await db.items.toArray()
  for (const item of items) {
    if (item.tags.some((t) => !isEncryptedContent(t) && t !== '')) {
      await db.items.update(item.id, { tags: await encryptTags(item.tags, key) })
    }
  }

  const folders = await db.folders.toArray()
  for (const folder of folders) {
    if (!isEncryptedContent(folder.name) && folder.name !== '') {
      await db.folders.update(folder.id, { name: await encryptFolderName(folder.name, key) })
    }
  }
}

/** 암호화된 태그·폴더명을 평문으로 되돌린다(멱등). 암호화 비활성화 시 호출. */
export async function decryptAllMeta(key: CryptoKey): Promise<void> {
  const items = await db.items.toArray()
  for (const item of items) {
    if (item.tags.some((t) => isEncryptedContent(t))) {
      await db.items.update(item.id, { tags: await decryptTags(item.tags, key) })
    }
  }

  const folders = await db.folders.toArray()
  for (const folder of folders) {
    if (isEncryptedContent(folder.name)) {
      await db.folders.update(folder.id, { name: await decryptFolderName(folder.name, key) })
    }
  }
}

/**
 * 옛 키 암호문을 새 키 암호문으로 교체한다. 패스프레이즈 변경 시 호출.
 * content만 재암호화하고 여기를 빠뜨리면 태그·폴더명이 영구히 복구 불능이 된다.
 */
export async function reencryptMeta(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
  const items = await db.items.toArray()
  for (const item of items) {
    if (item.tags.length === 0) continue
    const plain = await decryptTags(item.tags, oldKey)
    await db.items.update(item.id, { tags: await encryptTags(plain, newKey) })
  }

  const folders = await db.folders.toArray()
  for (const folder of folders) {
    if (folder.name === '') continue
    const plain = await decryptFolderName(folder.name, oldKey)
    await db.folders.update(folder.id, { name: await encryptFolderName(plain, newKey) })
  }
}

/**
 * 폴더 생성 — 이름을 암호화해 저장한다.
 * 생성 지점이 3곳(사이드바 버튼·커맨드 팔레트·단축키)이라 각자 암호화하면 한 곳만 빠뜨려도
 * 평문 폴더가 섞인다. key가 null이면 암호화 미사용(또는 잠금) 상태이므로 평문 그대로 둔다.
 */
export async function createFolder(
  parentId: number | null,
  name: string,
  key: CryptoKey | null,
): Promise<number> {
  const now = Date.now()
  return (await db.folders.add({
    parentId,
    name: key ? await encryptFolderName(name, key) : name,
    order: now,
    createdAt: now,
  } as Parameters<typeof db.folders.add>[0])) as number
}

/** 폴더 이름 변경 — 생성과 같은 규율로 암호화한다. */
export async function renameFolder(id: number, name: string, key: CryptoKey | null): Promise<void> {
  await db.folders.update(id, { name: key ? await encryptFolderName(name, key) : name })
}
