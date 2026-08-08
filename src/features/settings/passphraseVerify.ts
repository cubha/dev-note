// src/features/settings/passphraseVerify.ts
//
// SecurityTab의 잠금 해제·비활성화·패스프레이즈 변경이 공유하는 검증 로직.
// 컴포넌트 파일(.tsx)에서 분리한 이유는 fast-refresh 제약(컴포넌트 파일은
// 컴포넌트만 export해야 함) 때문 — 로직 자체는 SecurityTab 전용이다.

import { db } from '../../core/db'
import type { AppConfig } from '../../core/db'
import { decryptContent, isEncryptedContent } from '../../core/content'
import { verifyCanary } from '../../core/crypto'

export type PassphraseVerdict = 'verified' | 'failed' | 'unverifiable'

/**
 * 패스프레이즈로 파생한 key가 실제로 맞는지 검증한다.
 * 우선순위: 카나리(cfg.encryptionCheck) → 첫 암호화 아이템 content → 첫 암호화 태그/폴더명.
 * v19까지는 content만 봤는데, 태그·폴더명만 암호화되고 content는 하나도 암호화 안 된
 * 상태(활성화 직후 곧바로 패스프레이즈 변경 등)에서는 그 검증이 통째로 스킵되어
 * 틀린 패스프레이즈도 통과했다 — 그 결과가 reencryptMeta/decryptAllMeta로 흘러가
 * 원본을 덮어쓰는 사고로 이어졌다(strict 복호화로 파괴는 막았지만 검증 공백은 남아 있었음).
 * 어느 것도 없으면(진짜로 완전히 빈 암호화 상태) 검증할 대상 자체가 없어 unverifiable —
 * 이 경우는 카나리를 소급 기록하지 않는다(이번 키가 맞다는 근거가 없어서, 틀린 키를
 * 카나리로 고정시키면 다음번 올바른 패스프레이즈가 오히려 거부된다).
 */
export async function verifyPassphrase(key: CryptoKey, cfg: AppConfig): Promise<PassphraseVerdict> {
  if (cfg.encryptionCheck) {
    return (await verifyCanary(cfg.encryptionCheck, key)) ? 'verified' : 'failed'
  }

  const firstEncrypted = await db.items.filter((item) => isEncryptedContent(item.content)).first()
  if (firstEncrypted) {
    try {
      await decryptContent(firstEncrypted.content, key)
      return 'verified'
    } catch {
      return 'failed'
    }
  }

  const itemWithTag = await db.items.filter((item) => item.tags.some((t) => isEncryptedContent(t))).first()
  if (itemWithTag) {
    const encTag = itemWithTag.tags.find((t) => isEncryptedContent(t))
    if (encTag) {
      try {
        await decryptContent(encTag, key)
        return 'verified'
      } catch {
        return 'failed'
      }
    }
  }

  const encFolder = await db.folders.filter((f) => isEncryptedContent(f.name)).first()
  if (encFolder) {
    try {
      await decryptContent(encFolder.name, key)
      return 'verified'
    } catch {
      return 'failed'
    }
  }

  return 'unverifiable'
}
