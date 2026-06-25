import { describe, it, expect } from 'vitest'
import {
  generateDEK,
  deriveKEK,
  wrapDEK,
  unwrapDEK,
  importDEK,
} from '../core/sync-crypto'
import { encrypt, decrypt, generateSalt } from '../core/crypto'

const PASS = 'correct horse battery staple'

describe('generateDEK', () => {
  it('호출마다 서로 다른 DEK를 생성한다 (랜덤 고엔트로피)', () => {
    const a = generateDEK()
    const b = generateDEK()
    expect(a).not.toBe(b)
    // base64(32바이트) = 44자 (패딩 포함)
    expect(a.length).toBeGreaterThanOrEqual(43)
  })
})

describe('wrapDEK / unwrapDEK 라운드트립', () => {
  it('KEK로 wrap한 DEK를 같은 KEK로 unwrap하면 원본 복원', async () => {
    const salt = generateSalt()
    const dek = generateDEK()
    const kek = await deriveKEK(PASS, salt)
    const wrapped = await wrapDEK(dek, kek)
    expect(wrapped).not.toBe(dek) // 암호화됨
    const unwrapped = await unwrapDEK(wrapped, await deriveKEK(PASS, salt))
    expect(unwrapped).toBe(dek)
  })

  it('틀린 패스프레이즈 → unwrapDEK 거부 (AES-GCM 인증 실패)', async () => {
    const salt = generateSalt()
    const dek = generateDEK()
    const wrapped = await wrapDEK(dek, await deriveKEK(PASS, salt))
    const wrongKek = await deriveKEK('wrong-passphrase', salt)
    await expect(unwrapDEK(wrapped, wrongKek)).rejects.toThrow(/패스프레이즈/)
  })

  it('같은 패스프레이즈라도 salt가 다르면 unwrap 실패 (KEK가 salt에 묶임)', async () => {
    const dek = generateDEK()
    const wrapped = await wrapDEK(dek, await deriveKEK(PASS, generateSalt()))
    const otherSaltKek = await deriveKEK(PASS, generateSalt())
    await expect(unwrapDEK(wrapped, otherSaltKek)).rejects.toThrow()
  })
})

describe('importDEK — 노트 암호화용 CryptoKey', () => {
  it('import한 DEK로 노트 content 암/복호화 라운드트립', async () => {
    const dek = generateDEK()
    const key = await importDEK(dek)
    const plaintext = '{"format":"legacy","text":"비밀 노트"}'
    const ct = await encrypt(plaintext, key)
    expect(await decrypt(ct, await importDEK(dek))).toBe(plaintext)
  })

  it('다른 DEK로는 복호화 불가', async () => {
    const ct = await encrypt('secret', await importDEK(generateDEK()))
    await expect(decrypt(ct, await importDEK(generateDEK()))).rejects.toThrow()
  })
})
