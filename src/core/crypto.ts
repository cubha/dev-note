// src/core/crypto.ts
//
// Web Crypto API 래퍼 — AES-GCM at-rest 암호화
// 패스프레이즈 → PBKDF2 키 파생 → AES-GCM 암호화/복호화

const PBKDF2_ITERATIONS = 100_000
const AES_KEY_ALGO = { name: 'AES-GCM', length: 256 } as const
const IV_BYTES = 12
const SALT_BYTES = 16

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES))
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase) as unknown as ArrayBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    AES_KEY_ALGO,
    false,
    ['encrypt', 'decrypt'],
  )
}

// IV(12 bytes) || ciphertext → base64 문자열 반환
export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    key,
    enc.encode(plaintext) as unknown as ArrayBuffer,
  )
  const combined = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_BYTES)
  return btoa(String.fromCharCode(...combined))
}

// base64 → IV 분리 → AES-GCM 복호화
export async function decrypt(ciphertext: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0))
  const iv = combined.slice(0, IV_BYTES)
  const data = combined.slice(IV_BYTES)
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    key,
    data as unknown as ArrayBuffer,
  )
  return new TextDecoder().decode(plaintext)
}

// salt(Uint8Array) → hex 문자열 (AppConfig.encryptionSalt 저장용)
export function saltToHex(salt: Uint8Array): string {
  return Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// hex 문자열 → salt(Uint8Array)
export function hexToSalt(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return arr
}
