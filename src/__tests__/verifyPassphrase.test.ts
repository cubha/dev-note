// verifyPassphrase — SecurityTab의 잠금 해제·비활성화·패스프레이즈 변경이 공유하는
// 검증 로직. content가 하나도 암호화되지 않은 상태(태그·폴더명만 암호화)에서
// 검증이 스킵되어 틀린 패스프레이즈가 통과하던 결함(카나리 부재)의 회귀 테스트.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { db, ensureConfig } from '../core/db'
import { verifyPassphrase } from '../features/settings/passphraseVerify'
import { deriveKey, generateSalt, makeCanary, encrypt } from '../core/crypto'
import { encryptTags, encryptFolderName } from '../core/metaCrypto'
import type { AppConfig, Item, Folder } from '../core/db'

let key: CryptoKey
let wrongKey: CryptoKey

beforeAll(async () => {
  key = await deriveKey('passphrase', generateSalt())
  wrongKey = await deriveKey('WRONG-passphrase', generateSalt())
})

async function baseConfig(overrides: Partial<AppConfig> = {}): Promise<AppConfig> {
  const cfg = await ensureConfig()
  return { ...cfg, encryptionEnabled: true, encryptionSalt: 'x', ...overrides }
}

describe('verifyPassphrase', () => {
  beforeEach(async () => {
    await db.items.clear()
    await db.folders.clear()
    await db.config.clear()
  })

  it('카나리가 있으면 그것만으로 검증한다 — 맞는 키', async () => {
    const canary = await makeCanary(key)
    const cfg = await baseConfig({ encryptionCheck: canary })
    expect(await verifyPassphrase(key, cfg)).toBe('verified')
  })

  it('카나리가 있으면 그것만으로 검증한다 — 틀린 키', async () => {
    const canary = await makeCanary(key)
    const cfg = await baseConfig({ encryptionCheck: canary })
    expect(await verifyPassphrase(wrongKey, cfg)).toBe('failed')
  })

  it('카나리가 없고 암호화된 content가 있으면 그걸로 검증한다', async () => {
    await db.items.add({
      folderId: null, title: 't', type: 'note', tags: [],
      content: JSON.stringify({ enc: 1, ct: await encrypt('x', key) }),
      order: 0, pinned: false, updatedAt: 1, createdAt: 1,
    } as Omit<Item, 'id'>)
    const cfg = await baseConfig({ encryptionCheck: null })
    expect(await verifyPassphrase(key, cfg)).toBe('verified')
    expect(await verifyPassphrase(wrongKey, cfg)).toBe('failed')
  })

  it('카나리도 암호화된 content도 없지만 암호화된 태그가 있으면 그걸로 검증한다(핵심 회귀 케이스)', async () => {
    await db.items.add({
      folderId: null, title: 't', type: 'note',
      tags: await encryptTags(['prod'], key),
      content: '{"format":"legacy","text":"plain"}',
      order: 0, pinned: false, updatedAt: 1, createdAt: 1,
    } as Omit<Item, 'id'>)
    const cfg = await baseConfig({ encryptionCheck: null })
    expect(await verifyPassphrase(key, cfg)).toBe('verified')
    expect(await verifyPassphrase(wrongKey, cfg)).toBe('failed')
  })

  it('카나리·content·태그 모두 없지만 암호화된 폴더명이 있으면 그걸로 검증한다', async () => {
    await db.folders.add({
      parentId: null, name: await encryptFolderName('사내 인프라', key), order: 0, createdAt: 1,
    } as Omit<Folder, 'id'>)
    const cfg = await baseConfig({ encryptionCheck: null })
    expect(await verifyPassphrase(key, cfg)).toBe('verified')
    expect(await verifyPassphrase(wrongKey, cfg)).toBe('failed')
  })

  it('검증할 대상이 전무하면 unverifiable — 통과시키지도 거부하지도 않는다', async () => {
    const cfg = await baseConfig({ encryptionCheck: null })
    expect(await verifyPassphrase(key, cfg)).toBe('unverifiable')
    expect(await verifyPassphrase(wrongKey, cfg)).toBe('unverifiable')
  })
})
