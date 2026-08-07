import { describe, it, expect, beforeAll } from 'vitest'
import {
  encryptTags, decryptTags, encryptFolderName, decryptFolderName, LOCKED_FOLDER_LABEL,
  decryptTagsStrict, decryptFolderNameStrict,
} from '../core/metaCrypto'
import { isEncryptedContent } from '../core/content'
import { deriveKey, generateSalt } from '../core/crypto'

let key: CryptoKey
let otherKey: CryptoKey

beforeAll(async () => {
  key = await deriveKey('passphrase', generateSalt())
  otherKey = await deriveKey('other-passphrase', generateSalt())
})

describe('encryptTags / decryptTags', () => {
  it('원소별로 암호화하고 배열 길이를 유지한다', async () => {
    const enc = await encryptTags(['prod', 'db'], key)
    expect(enc).toHaveLength(2)
    expect(enc.every((t) => isEncryptedContent(t))).toBe(true)
    expect(enc).not.toContain('prod')
  })

  it('암호화 → 복호화 왕복으로 원본 순서와 값이 보존된다', async () => {
    const enc = await encryptTags(['prod', 'db', '한글태그'], key)
    expect(await decryptTags(enc, key)).toEqual(['prod', 'db', '한글태그'])
  })

  it('같은 태그도 매번 다른 암호문이 된다(IV 랜덤 — 결정론적 암호화 아님)', async () => {
    const [a] = await encryptTags(['prod'], key)
    const [b] = await encryptTags(['prod'], key)
    expect(a).not.toBe(b)
  })

  it('이미 암호문인 원소는 재암호화하지 않는다(멱등)', async () => {
    const once = await encryptTags(['prod'], key)
    const twice = await encryptTags(once, key)
    expect(twice).toEqual(once)
    expect(await decryptTags(twice, key)).toEqual(['prod'])
  })

  it('평문과 암호문이 섞인 배열도 그대로 처리한다(백필 진행 중 상태)', async () => {
    const [encProd] = await encryptTags(['prod'], key)
    const mixed = [encProd, 'staging']
    expect(await decryptTags(mixed, key)).toEqual(['prod', 'staging'])

    const allEnc = await encryptTags(mixed, key)
    expect(allEnc.every((t) => isEncryptedContent(t))).toBe(true)
    expect(allEnc[0]).toBe(encProd) // 이미 암호문이던 원소는 건드리지 않음
    expect(await decryptTags(allEnc, key)).toEqual(['prod', 'staging'])
  })

  it('키가 없으면 암호문 원소를 노출하지 않고 제외한다', async () => {
    const enc = await encryptTags(['prod', 'db'], key)
    expect(await decryptTags(enc, null)).toEqual([])
  })

  it('키가 없어도 평문 원소는 그대로 보여준다(암호화 미사용 사용자)', async () => {
    expect(await decryptTags(['prod', 'db'], null)).toEqual(['prod', 'db'])
  })

  it('틀린 키로 복호화하면 해당 원소를 조용히 제외한다(깨진 문자열 노출 금지)', async () => {
    const enc = await encryptTags(['prod'], key)
    expect(await decryptTags(enc, otherKey)).toEqual([])
  })

  it('빈 배열은 그대로 빈 배열', async () => {
    expect(await encryptTags([], key)).toEqual([])
    expect(await decryptTags([], key)).toEqual([])
    expect(await decryptTags([], null)).toEqual([])
  })
})

describe('encryptFolderName / decryptFolderName', () => {
  it('암호화 → 복호화 왕복', async () => {
    const enc = await encryptFolderName('사내 인프라', key)
    expect(isEncryptedContent(enc)).toBe(true)
    expect(enc).not.toContain('사내 인프라')
    expect(await decryptFolderName(enc, key)).toBe('사내 인프라')
  })

  it('이미 암호문이면 재암호화하지 않는다(멱등)', async () => {
    const once = await encryptFolderName('프로덕션', key)
    expect(await encryptFolderName(once, key)).toBe(once)
    expect(await decryptFolderName(once, key)).toBe('프로덕션')
  })

  it('키가 없으면 잠금 라벨을 돌려준다 — 암호문을 그대로 화면에 내보내지 않는다', async () => {
    const enc = await encryptFolderName('프로덕션', key)
    expect(await decryptFolderName(enc, null)).toBe(LOCKED_FOLDER_LABEL)
  })

  it('틀린 키도 잠금 라벨로 처리한다(예외로 트리 렌더가 깨지지 않도록)', async () => {
    const enc = await encryptFolderName('프로덕션', key)
    expect(await decryptFolderName(enc, otherKey)).toBe(LOCKED_FOLDER_LABEL)
  })

  it('평문 폴더명은 키 유무와 무관하게 그대로 통과한다', async () => {
    expect(await decryptFolderName('일반폴더', key)).toBe('일반폴더')
    expect(await decryptFolderName('일반폴더', null)).toBe('일반폴더')
  })

  it('빈 문자열은 암호화 대상이 아니다', async () => {
    expect(await encryptFolderName('', key)).toBe('')
    expect(await decryptFolderName('', null)).toBe('')
  })
})

describe('decryptTagsStrict / decryptFolderNameStrict — 쓰기 경로 전용, 실패 시 원본 보존을 위해 throw', () => {
  it('decryptTagsStrict: 틀린 키로 복호화하면 예외를 던진다(조용히 제외하지 않음)', async () => {
    const enc = await encryptTags(['prod'], key)
    await expect(decryptTagsStrict(enc, otherKey)).rejects.toThrow()
  })

  it('decryptTagsStrict: 올바른 키면 정상 복호화된다', async () => {
    const enc = await encryptTags(['prod', 'db'], key)
    expect(await decryptTagsStrict(enc, key)).toEqual(['prod', 'db'])
  })

  it('decryptTagsStrict: 평문 원소는 키 무관 그대로 통과한다(백필 혼재 상태)', async () => {
    expect(await decryptTagsStrict(['staging'], key)).toEqual(['staging'])
  })

  it('decryptFolderNameStrict: 틀린 키로 복호화하면 예외를 던진다(잠금 라벨로 대체하지 않음)', async () => {
    const enc = await encryptFolderName('프로덕션', key)
    await expect(decryptFolderNameStrict(enc, otherKey)).rejects.toThrow()
  })

  it('decryptFolderNameStrict: 올바른 키면 정상 복호화된다', async () => {
    const enc = await encryptFolderName('프로덕션', key)
    expect(await decryptFolderNameStrict(enc, key)).toBe('프로덕션')
  })

  it('decryptFolderNameStrict: 평문 폴더명은 키 무관 그대로 통과한다', async () => {
    expect(await decryptFolderNameStrict('일반폴더', key)).toBe('일반폴더')
  })
})
