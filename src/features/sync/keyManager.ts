// src/features/sync/keyManager.ts
//
// 동기화 키 온보딩 — DEK/KEK 모델의 meta.json 생성·해제·패스프레이즈 변경.
// - meta.json(SyncMeta) = salt + wrappedDEK + verifyToken. 클라우드(provider)에 저장.
// - DEK는 절대 평문으로 클라우드에 가지 않는다(KEK로 wrap). 서버/프로바이더는 키를 못 봄.
// - 패스프레이즈 변경 = DEK 그대로, KEK만 새 salt로 재파생해 re-wrap 1회(노트 재암호화 없음).

import {
  generateDEK,
  deriveKEK,
  wrapDEK,
  unwrapDEK,
  importDEK,
  SYNC_PBKDF2_ITERATIONS,
} from '../../core/sync-crypto'
import { encrypt, decrypt, generateSalt, saltToHex, hexToSalt } from '../../core/crypto'
import { isSyncMeta } from './sync-schema'
import type { SyncMeta } from './sync-schema'
import type { StorageProvider } from './providers/StorageProvider'

export const META_FILE = 'meta.json'
const VERIFY_CONSTANT = 'devnote-sync-verify-v1'
const META_VERSION = 1

/** DEK(base64) + 그 DEK를 import한 노트 암호화 키 */
export interface UnlockedKeys {
  dek: string
  noteKey: CryptoKey
}

async function makeVerifyToken(dek: string): Promise<string> {
  return encrypt(VERIFY_CONSTANT, await importDEK(dek))
}

async function buildMeta(dek: string, passphrase: string): Promise<SyncMeta> {
  const salt = generateSalt()
  const iterations = SYNC_PBKDF2_ITERATIONS
  const kek = await deriveKEK(passphrase, salt, iterations)
  return {
    format: 'devnote-sync-meta',
    version: META_VERSION,
    kdf: 'PBKDF2',
    iterations, // 기록값과 파생값 일치 (unlock이 이 값으로 재파생)
    salt: saltToHex(salt),
    wrappedDEK: await wrapDEK(dek, kek),
    verifyToken: await makeVerifyToken(dek),
  }
}

async function unlocked(dek: string): Promise<UnlockedKeys> {
  return { dek, noteKey: await importDEK(dek) }
}

async function loadMeta(provider: StorageProvider): Promise<SyncMeta | null> {
  const raw = await provider.get(META_FILE)
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('동기화 메타데이터(meta.json)가 손상되었습니다')
  }
  if (!isSyncMeta(parsed)) {
    throw new Error('동기화 메타데이터 형식이 올바르지 않습니다')
  }
  return parsed
}

/**
 * 최초 동기화 설정 — 새 DEK 생성 후 meta.json을 클라우드에 기록한다.
 * 이미 meta.json이 있으면(다른 기기가 설정) 에러 → unlockDevice를 사용해야 한다.
 */
export async function setupSync(
  provider: StorageProvider,
  passphrase: string,
): Promise<UnlockedKeys> {
  const existing = await loadMeta(provider)
  if (existing) {
    throw new Error('이미 동기화가 설정된 저장소입니다 — 기존 패스프레이즈로 연결해 주세요')
  }
  const dek = generateDEK()
  const meta = await buildMeta(dek, passphrase)
  await provider.put(META_FILE, JSON.stringify(meta))
  return unlocked(dek)
}

/**
 * 기존 저장소에 이 기기를 연결 — meta.json을 읽어 패스프레이즈로 DEK를 unwrap한다.
 * 패스프레이즈가 틀리면 unwrapDEK가 AES-GCM 인증 실패로 거부한다.
 */
export async function unlockDevice(
  provider: StorageProvider,
  passphrase: string,
): Promise<UnlockedKeys> {
  const meta = await loadMeta(provider)
  if (!meta) {
    throw new Error('동기화가 설정되지 않은 저장소입니다 — 먼저 설정해 주세요')
  }
  if (meta.iterations < 100_000) {
    throw new Error('동기화 메타데이터의 보안 파라미터가 유효하지 않습니다')
  }
  // meta에 기록된 iterations로 재파생 (구버전 100k·신버전 600k 모두 호환)
  const kek = await deriveKEK(passphrase, hexToSalt(meta.salt), meta.iterations)
  const dek = await unwrapDEK(meta.wrappedDEK, kek) // 틀린 패스프레이즈 → throw
  // 이중 검증: DEK로 verifyToken을 복호화해 상수 일치 확인 (손상/불일치 meta 방어)
  const noteKey = await importDEK(dek)
  let verified: string
  try {
    verified = await decrypt(meta.verifyToken, noteKey)
  } catch {
    throw new Error('패스프레이즈가 올바르지 않거나 동기화 키가 손상되었습니다')
  }
  if (verified !== VERIFY_CONSTANT) {
    throw new Error('동기화 키 검증에 실패했습니다')
  }
  return { dek, noteKey }
}

/**
 * 패스프레이즈 변경 — DEK는 유지하고 새 salt로 KEK를 재파생해 meta.json만 갱신한다.
 * 노트 자체는 재암호화하지 않는다(DEK 불변).
 */
export async function changePassphrase(
  provider: StorageProvider,
  oldPassphrase: string,
  newPassphrase: string,
): Promise<UnlockedKeys> {
  const { dek } = await unlockDevice(provider, oldPassphrase)
  const meta = await buildMeta(dek, newPassphrase)
  await provider.put(META_FILE, JSON.stringify(meta))
  return unlocked(dek)
}
