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
import {
  encryptTags, encryptFolderName,
  decryptTagsStrict, decryptFolderNameStrict,
} from './metaCrypto'
import { isEncryptedContent } from './content'

/** 태그·폴더명 변환 결과 — 계산(암호 연산)과 쓰기(Dexie)를 분리하기 위한 중간 표현 */
export interface MetaUpdates {
  items: { id: number; tags: string[] }[]
  folders: { id: number; name: string }[]
}

/**
 * 평문으로 남은 태그·폴더명의 암호화 결과를 **계산만** 한다(멱등, DB 미수정).
 *
 * 쓰기를 분리한 이유: 암호화 활성화는 이 백필과 content 암호화, 그리고 salt·canary
 * 기록이 **모두 함께** 성립해야 한다. 백필이 먼저 DB에 커밋되고 salt 기록이 실패하면,
 * 그 키를 다시 파생할 salt가 없어 암호화된 태그·폴더명을 영영 되돌릴 수 없다
 * (decryptAllMeta·reencryptMeta 경로는 salt가 이미 있어 재시도로 복구되지만,
 * 최초 활성화는 salt 자체가 없다는 점에서 성격이 다르다 — security-auditor 지적).
 */
export async function computeBackfillMeta(key: CryptoKey): Promise<MetaUpdates> {
  const items = await db.items.toArray()
  const itemUpdates: MetaUpdates['items'] = []
  for (const item of items) {
    if (item.tags.some((t) => !isEncryptedContent(t) && t !== '')) {
      itemUpdates.push({ id: item.id, tags: await encryptTags(item.tags, key) })
    }
  }

  const folders = await db.folders.toArray()
  const folderUpdates: MetaUpdates['folders'] = []
  for (const folder of folders) {
    if (!isEncryptedContent(folder.name) && folder.name !== '') {
      folderUpdates.push({ id: folder.id, name: await encryptFolderName(folder.name, key) })
    }
  }

  return { items: itemUpdates, folders: folderUpdates }
}

/** 계산된 메타 변환을 쓴다. 호출부가 더 큰 트랜잭션에 합류시킬 수 있도록 트랜잭션을 열지 않는다. */
export async function writeMetaUpdates(updates: MetaUpdates): Promise<void> {
  for (const u of updates.items) await db.items.update(u.id, { tags: u.tags })
  for (const u of updates.folders) await db.folders.update(u.id, { name: u.name })
}

/**
 * 평문으로 남은 태그·폴더명을 암호화한다(멱등). 잠금 해제 시 호출.
 * 계산을 전부 끝낸 뒤 한 트랜잭션으로 쓴다 — 형제 함수(decryptAllMeta·reencryptMeta)와 동일.
 */
export async function backfillMeta(key: CryptoKey): Promise<void> {
  const updates = await computeBackfillMeta(key)
  await db.transaction('rw', db.items, db.folders, () => writeMetaUpdates(updates))
}

/**
 * 암호화된 태그·폴더명을 평문으로 되돌린다(멱등). 암호화 비활성화 시 호출.
 *
 * strict 복호화 + compute-then-write로 동작한다: 모든 아이템·폴더의 복호화를
 * 메모리에서 **먼저 전부** 끝낸 뒤에야 DB에 쓴다. 순서를 바꿔 "복호화되는 대로 즉시
 * 쓰기"를 했다면, 아이템은 성공하고 폴더에서 실패하는 경우 아이템만 평문화되고
 * 폴더는 암호문으로 남는 반쪽 상태가 생긴다 — 실패 시 아예 아무것도 쓰지 않아야
 * 그 상태 자체가 불가능해진다.
 */
export async function decryptAllMeta(key: CryptoKey): Promise<void> {
  const items = await db.items.toArray()
  const itemUpdates: { id: number; tags: string[] }[] = []
  for (const item of items) {
    if (item.tags.some((t) => isEncryptedContent(t))) {
      itemUpdates.push({ id: item.id, tags: await decryptTagsStrict(item.tags, key) })
    }
  }

  const folders = await db.folders.toArray()
  const folderUpdates: { id: number; name: string }[] = []
  for (const folder of folders) {
    if (isEncryptedContent(folder.name)) {
      folderUpdates.push({ id: folder.id, name: await decryptFolderNameStrict(folder.name, key) })
    }
  }

  await db.transaction('rw', db.items, db.folders, async () => {
    for (const u of itemUpdates) await db.items.update(u.id, { tags: u.tags })
    for (const u of folderUpdates) await db.folders.update(u.id, { name: u.name })
  })
}

/**
 * 옛 키 암호문을 새 키 암호문으로 교체한다. 패스프레이즈 변경 시 호출.
 * content만 재암호화하고 여기를 빠뜨리면 태그·폴더명이 영구히 복구 불능이 된다.
 *
 * strict 복호화 + compute-then-write(decryptAllMeta와 같은 이유)로 동작한다.
 * oldKey가 틀리면(카나리를 통과 못 한 경우까지 포함한 방어선) 계산 단계에서
 * 던져 DB에 아무것도 쓰지 않는다 — 아이템은 새 키로 넘어갔는데 폴더는 옛 키로
 * 남는 "키가 갈라진" 상태를 원천적으로 막는다. 평문으로 남아 있던 값은 strict에서도
 * 그대로 통과하므로 백필 누락분 흡수는 그대로 동작한다.
 */
export async function reencryptMeta(oldKey: CryptoKey, newKey: CryptoKey): Promise<void> {
  const items = await db.items.toArray()
  const itemUpdates: { id: number; tags: string[] }[] = []
  for (const item of items) {
    if (item.tags.length === 0) continue
    const plain = await decryptTagsStrict(item.tags, oldKey)
    itemUpdates.push({ id: item.id, tags: await encryptTags(plain, newKey) })
  }

  const folders = await db.folders.toArray()
  const folderUpdates: { id: number; name: string }[] = []
  for (const folder of folders) {
    if (folder.name === '') continue
    const plain = await decryptFolderNameStrict(folder.name, oldKey)
    folderUpdates.push({ id: folder.id, name: await encryptFolderName(plain, newKey) })
  }

  await db.transaction('rw', db.items, db.folders, async () => {
    for (const u of itemUpdates) await db.items.update(u.id, { tags: u.tags })
    for (const u of folderUpdates) await db.folders.update(u.id, { name: u.name })
  })
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
