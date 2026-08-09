import { describe, it, expect, beforeAll } from 'vitest'
import { deriveKey, generateSalt, makeCanary, verifyCanary } from '../core/crypto'

let key: CryptoKey
let otherKey: CryptoKey

beforeAll(async () => {
  key = await deriveKey('passphrase', generateSalt())
  otherKey = await deriveKey('other-passphrase', generateSalt())
})

describe('makeCanary / verifyCanary — 패스프레이즈 검증용 고정 마커', () => {
  it('올바른 키로 검증하면 true', async () => {
    const canary = await makeCanary(key)
    expect(await verifyCanary(canary, key)).toBe(true)
  })

  it('틀린 키로 검증하면 true를 반환하지 않는다(예외로 죽지 않고 false)', async () => {
    const canary = await makeCanary(key)
    await expect(verifyCanary(canary, otherKey)).resolves.toBe(false)
  })

  it('망가진 카나리 문자열도 예외 없이 false', async () => {
    await expect(verifyCanary('not-a-valid-canary', key)).resolves.toBe(false)
  })

  it('매번 다른 암호문이 생성된다(IV 랜덤)', async () => {
    const a = await makeCanary(key)
    const b = await makeCanary(key)
    expect(a).not.toBe(b)
    expect(await verifyCanary(a, key)).toBe(true)
    expect(await verifyCanary(b, key)).toBe(true)
  })
})
