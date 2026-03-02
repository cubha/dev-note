/**
 * Web Crypto API 기반 암호화 유틸
 * - 키 파생: PBKDF2 (SHA-256, 100,000 iterations)
 * - 암호화:  AES-GCM 256bit
 * - 외부 라이브러리 불필요 (브라우저 내장)
 */

const PBKDF2_ITERATIONS = 100_000
const SALT_BYTE_LENGTH  = 16
const IV_BYTE_LENGTH    = 12

// ─── Salt ─────────────────────────────────────────────────────

export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH))
  return bufferToHex(salt)
}

// ─── 키 파생 ──────────────────────────────────────────────────

export async function deriveKey(password: string, saltHex: string): Promise<CryptoKey> {
  const enc = new TextEncoder()

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       hexToBuffer(saltHex) as unknown as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash:       'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// ─── 암호화 ───────────────────────────────────────────────────

export async function encryptText(
  key: CryptoKey,
  plaintext: string,
): Promise<{ cipher: string; iv: string }> {
  const enc = new TextEncoder()
  const iv  = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH))

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    key,
    enc.encode(plaintext),
  )

  return {
    cipher: bufferToBase64(encrypted),
    iv:     uint8ToBase64(iv),
  }
}

// ─── 복호화 ───────────────────────────────────────────────────

export async function decryptText(
  key: CryptoKey,
  cipher: string,
  iv: string,
): Promise<string> {
  const dec = new TextDecoder()

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(iv) as unknown as ArrayBuffer },
    key,
    base64ToBuffer(cipher) as unknown as ArrayBuffer,
  )

  return dec.decode(decrypted)
}

// ─── 암호화 활성화 여부 확인 후 처리 ─────────────────────────

/** 암호화 키가 있으면 암호화, 없으면 평문 그대로 반환 */
export async function safeEncrypt(
  key: CryptoKey | null,
  plaintext: string,
): Promise<{ encryptedContent: string; iv: string | null }> {
  if (!key) return { encryptedContent: plaintext, iv: null }
  const { cipher, iv } = await encryptText(key, plaintext)
  return { encryptedContent: cipher, iv }
}

/** 암호화 키가 있고 iv가 있으면 복호화, 없으면 평문 그대로 반환 */
export async function safeDecrypt(
  key: CryptoKey | null,
  encryptedContent: string | null,
  iv: string | null,
): Promise<string> {
  if (!encryptedContent) return ''
  if (!key || !iv) return encryptedContent
  return decryptText(key, encryptedContent, iv)
}

// ─── 내부 유틸 ────────────────────────────────────────────────

function bufferToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuffer(hex: string): Uint8Array {
  const matches = hex.match(/.{1,2}/g) ?? []
  return new Uint8Array(matches.map(b => parseInt(b, 16)))
}

// ArrayBuffer → Base64
function bufferToBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

// Uint8Array → Base64 (TypeScript 5.7+ 제네릭 분리 대응)
function uint8ToBase64(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
}

function base64ToBuffer(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
