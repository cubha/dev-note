import { describe, it, expect } from 'vitest'
import {
  isEncryptedBackup,
  wrapEnvelope,
  unwrapEnvelope,
} from '../features/storage/envelope'
import type { EncryptedBackup } from '../features/storage/envelope'
import type { ExportSchema } from '../features/storage/schema'
import { encryptContent } from '../core/content'
import { deriveKey, generateSalt } from '../core/crypto'

// ── 테스트 픽스처 ──────────────────────────────────────────────

function makeSchema(itemContent = '{"format":"legacy","text":"hello"}'): ExportSchema {
  return {
    version: 2,
    exportedAt: 1_700_000_000_000,
    folders: [
      { id: 1, parentId: null, name: '루트', order: 0, createdAt: 1 },
    ],
    items: [
      {
        folderId: 1,
        title: '항목',
        type: 'note',
        tags: ['t1'],
        order: 0,
        pinned: false,
        content: itemContent,
        updatedAt: 2,
        createdAt: 1,
      },
    ],
  }
}

const PASS = 'correct horse battery staple'

// ── isEncryptedBackup ──────────────────────────────────────────

describe('isEncryptedBackup', () => {
  it('올바른 봉투 → true', () => {
    const backup: EncryptedBackup = {
      format: 'devnote-encrypted-backup',
      version: 1,
      kdf: 'PBKDF2',
      iterations: 100_000,
      salt: 'abcd',
      ciphertext: 'xxx',
    }
    expect(isEncryptedBackup(backup)).toBe(true)
  })

  it('일반 ExportSchema(평문 백업) → false', () => {
    expect(isEncryptedBackup(makeSchema())).toBe(false)
  })

  it('null/문자열/필드 누락 → false', () => {
    expect(isEncryptedBackup(null)).toBe(false)
    expect(isEncryptedBackup('string')).toBe(false)
    expect(isEncryptedBackup({ format: 'devnote-encrypted-backup' })).toBe(false)
  })
})

// ── wrap/unwrap 라운드트립 ─────────────────────────────────────

describe('wrapEnvelope / unwrapEnvelope', () => {
  it('라운드트립: 감싼 뒤 복호화하면 원본 ExportSchema 복원', async () => {
    const schema = makeSchema()
    const backup = await wrapEnvelope(schema, PASS)
    expect(backup.format).toBe('devnote-encrypted-backup')
    expect(backup.kdf).toBe('PBKDF2')
    expect(backup.iterations).toBe(100_000)
    expect(typeof backup.salt).toBe('string')
    expect(backup.salt.length).toBeGreaterThan(0)

    const restored = await unwrapEnvelope(backup, PASS)
    expect(restored).toEqual(schema)
  })

  it('봉투마다 salt가 다르다 (백업 전용 새 salt)', async () => {
    const a = await wrapEnvelope(makeSchema(), PASS)
    const b = await wrapEnvelope(makeSchema(), PASS)
    expect(a.salt).not.toBe(b.salt)
  })

  it('틀린 패스프레이즈 → 친절한 에러 throw (AES-GCM 인증 실패)', async () => {
    const backup = await wrapEnvelope(makeSchema(), PASS)
    await expect(unwrapEnvelope(backup, 'wrong-passphrase')).rejects.toThrow(
      /패스프레이즈/,
    )
  })

  it('직교성: content가 이미 암호화된 items도 봉투 라운드트립 보존', async () => {
    const key = await deriveKey('inner-pass', generateSalt())
    const encryptedItemContent = await encryptContent(
      '{"format":"legacy","text":"secret"}',
      key,
    )
    const schema = makeSchema(encryptedItemContent)
    const backup = await wrapEnvelope(schema, PASS)
    const restored = await unwrapEnvelope(backup, PASS)
    expect(restored.items[0].content).toBe(encryptedItemContent)
  })

  it('대용량 페이로드(~500KB)도 RangeError 없이 라운드트립', async () => {
    const big = 'a'.repeat(500_000)
    const schema = makeSchema(JSON.stringify({ format: 'legacy', text: big }))
    const backup = await wrapEnvelope(schema, PASS)
    const restored = await unwrapEnvelope(backup, PASS)
    expect(restored).toEqual(schema)
  })

  it('crypto-agility: 봉투에 기록된 iterations로 복호화', async () => {
    const backup = await wrapEnvelope(makeSchema(), PASS)
    // iterations를 명시적으로 다른 값으로 조작하면 키 파생이 달라져 복호화 실패해야 함
    const tampered: EncryptedBackup = { ...backup, iterations: 50_000 }
    await expect(unwrapEnvelope(tampered, PASS)).rejects.toThrow()
  })
})
