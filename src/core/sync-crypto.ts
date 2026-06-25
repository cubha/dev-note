// src/core/sync-crypto.ts
//
// DEK/KEK 키 모델 (Joplin 패턴) — 동기화 노트 암호화용
// - DEK(Data Encryption Key): 랜덤 고엔트로피 키. 실제 노트 content를 암호화.
// - KEK(Key Encryption Key): 패스프레이즈 + 랜덤 salt로 PBKDF2 파생. DEK를 wrap.
// - meta.json에는 wrap된 DEK만 저장 → 패스프레이즈 변경 = DEK re-wrap 1회(전체 재암호화 아님).
// - 봉투 백업(envelope.ts, 백업별 1회성 랜덤 salt)과 직교: 별도 파생 경로.
// - 자체 암호 프로토콜 직접 구현 금지 — 모두 검증된 Web Crypto 프리미티브(crypto.ts) 재사용.

import { deriveKey, encrypt, decrypt } from './crypto'

// DEK는 raw 32바이트를 base64 문자열로 표현 (직렬화·wrap 입력 일관성).
const DEK_BYTES = 32

// 동기화 전용 PBKDF2 반복(OWASP 2023 권고). meta.json의 wrappedDEK가 공개 오프라인
// 오라클이므로 무차별 대입 비용을 높인다. 전역 기본값(crypto.PBKDF2_ITERATIONS=100k)은
// 기존 at-rest/봉투 백업 호환을 위해 그대로 두고, 동기화만 이 상수를 사용한다.
export const SYNC_PBKDF2_ITERATIONS = 600_000

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** 랜덤 고엔트로피 DEK를 생성한다 (base64 문자열, 32바이트). */
export function generateDEK(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(DEK_BYTES)))
}

/**
 * 패스프레이즈 + salt로 KEK(CryptoKey)를 파생한다. crypto.deriveKey 재사용.
 * iterations 기본값은 동기화 전용 600k. unlock 시에는 meta.iterations를 명시 전달해야
 * 구버전(100k) meta.json도 복호화된다(crypto-agility).
 */
export async function deriveKEK(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = SYNC_PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  return deriveKey(passphrase, salt, iterations)
}

/**
 * DEK(base64)를 HMAC-SHA-256 키로 import한다. 노트 버전 지문 계산용.
 * 콘텐츠 해시를 DEK로 키잉하면 같은 DEK 보유 기기끼리는 수렴(version 비교)하되,
 * DEK 없는 제3자(클라우드 제공자)는 평문 상관분석·오프라인 추측을 못 한다.
 */
export async function importHmacKey(dek: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToBytes(dek) as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/** DEK(base64)를 KEK로 AES-GCM wrap하여 base64 봉투 문자열을 반환한다. */
export async function wrapDEK(dek: string, kek: CryptoKey): Promise<string> {
  return encrypt(dek, kek)
}

/**
 * wrap된 DEK를 KEK로 unwrap하여 DEK(base64)를 복원한다.
 * 패스프레이즈(=KEK)가 틀리면 AES-GCM 인증 태그 실패 → 친절한 에러 throw.
 */
export async function unwrapDEK(wrapped: string, kek: CryptoKey): Promise<string> {
  try {
    return await decrypt(wrapped, kek)
  } catch {
    throw new Error('패스프레이즈가 올바르지 않거나 동기화 키가 손상되었습니다')
  }
}

/** DEK(base64)를 노트 암호화에 사용할 AES-GCM CryptoKey로 import한다. */
export async function importDEK(dek: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToBytes(dek) as unknown as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}
