// src/features/settings/encryptionLifecycle.ts
//
// SecurityTab의 패스프레이즈 변경·암호화 비활성화 orchestration.
//
// 예전 순서(content를 즉시 db.items.update로 쓴 뒤 reencryptMeta/decryptAllMeta 호출)는
// 메타 재암호화·복호화가 실패하면(예: 태그·폴더명이 서로 다른 키로 섞인 상태) 이미
// newKey/평문으로 쓰인 content가 새 salt/config 갱신 없이 DB에 남는다 — 사용자는
// "오류가 발생했습니다"만 보고, 실제로는 content가 조용히 손상되거나(패스프레이즈
// 변경 실패 시 newKey 암호문인데 salt는 없음 → 영구 복구 불능) 노출된다(비활성화
// 실패 시 content만 평문, config는 여전히 encryptionEnabled: true).
//
// 메타(항상 스스로 전부-아니면-전무인 reencryptMeta/decryptAllMeta)를 먼저 끝내고,
// content 재암호화/복호화는 메모리에서 계산한 뒤 config와 함께 한 트랜잭션으로
// 커밋한다 — 어느 단계가 실패해도 부분 상태가 DB에 남을 수 없다.

import { db } from '../../core/db'
import { encryptContent, decryptContent, isEncryptedContent } from '../../core/content'
import { computeBackfillMeta, writeMetaUpdates, reencryptMeta, decryptAllMeta } from '../../core/metaStore'

/**
 * 암호화 활성화 — 태그·폴더명·content·config를 **전부 한 트랜잭션**으로 커밋한다.
 *
 * 나머지 두 lifecycle 함수와 달리 여기서는 메타를 먼저 별도 커밋하면 안 된다:
 * 백필이 커밋된 뒤 salt·canary 기록이 실패하면, 데이터는 key로 암호화됐는데 그 key를
 * 다시 파생할 salt가 DB에 없어 **영구 복구 불능**이 된다. 패스프레이즈 변경·비활성화는
 * salt가 이미 존재해 재시도로 복구되지만 최초 활성화만 이 성질이 다르다
 * (security-auditor 지적). 그래서 메타 계산도 content와 함께 트랜잭션 밖에서 끝내고,
 * 트랜잭션 안에는 Dexie 쓰기만 남긴다.
 */
export async function enableEncryptionAtomic(
  key: CryptoKey,
  saltHex: string,
  canary: string,
): Promise<void> {
  const metaUpdates = await computeBackfillMeta(key)

  const items = await db.items.toArray()
  const contentUpdates: { id: number; content: string }[] = []
  for (const item of items) {
    if (!isEncryptedContent(item.content)) {
      contentUpdates.push({ id: item.id, content: await encryptContent(item.content, key) })
    }
  }

  await db.transaction('rw', db.items, db.folders, db.config, async () => {
    await writeMetaUpdates(metaUpdates)
    for (const u of contentUpdates) await db.items.update(u.id, { content: u.content })
    await db.config.update(1, { encryptionEnabled: true, encryptionSalt: saltHex, encryptionCheck: canary })
  })
}

/** 패스프레이즈 변경 — 메타 재암호화 성공 후에만 content+salt+카나리를 함께 커밋한다. */
export async function changePassphraseAtomic(
  oldKey: CryptoKey,
  newKey: CryptoKey,
  newSaltHex: string,
  newCanary: string,
): Promise<void> {
  // 태그·폴더명 — reencryptMeta 자체가 이미 compute-then-write + transaction으로
  // 전부-아니면-전무를 보장한다. 여기서 던지면 아래 content 계산은 아직 아무것도
  // 쓰지 않았으므로 DB는 호출 전 상태 그대로다.
  await reencryptMeta(oldKey, newKey)

  const items = await db.items.toArray()
  const contentUpdates: { id: number; content: string }[] = []
  for (const item of items) {
    if (isEncryptedContent(item.content)) {
      const plain = await decryptContent(item.content, oldKey)
      contentUpdates.push({ id: item.id, content: await encryptContent(plain, newKey) })
    }
  }

  await db.transaction('rw', db.items, db.config, async () => {
    for (const u of contentUpdates) await db.items.update(u.id, { content: u.content })
    await db.config.update(1, { encryptionSalt: newSaltHex, encryptionCheck: newCanary })
  })
}

/** 암호화 비활성화 — 메타 복호화 성공 후에만 content 평문화+config를 함께 커밋한다. */
export async function disableEncryptionAtomic(key: CryptoKey): Promise<void> {
  await decryptAllMeta(key)

  const items = await db.items.toArray()
  const contentUpdates: { id: number; content: string }[] = []
  for (const item of items) {
    if (isEncryptedContent(item.content)) {
      contentUpdates.push({ id: item.id, content: await decryptContent(item.content, key) })
    }
  }

  await db.transaction('rw', db.items, db.config, async () => {
    for (const u of contentUpdates) await db.items.update(u.id, { content: u.content })
    await db.config.update(1, { encryptionEnabled: false, encryptionSalt: null, encryptionCheck: null })
  })
}
