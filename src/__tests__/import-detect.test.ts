import { describe, it, expect } from 'vitest'
import { detectBackupType, decryptBackup } from '../features/storage/import'
import { wrapEnvelope } from '../features/storage/envelope'
import type { ExportSchema } from '../features/storage/schema'

function makeSchema(): ExportSchema {
  return {
    version: 2,
    exportedAt: 1_700_000_000_000,
    folders: [{ id: 1, parentId: null, name: '루트', order: 0, createdAt: 1 }],
    items: [
      {
        folderId: 1,
        title: '항목',
        type: 'note',
        tags: [],
        order: 0,
        pinned: false,
        content: '{"format":"legacy","text":"hi"}',
        updatedAt: 2,
        createdAt: 1,
      },
    ],
  }
}

const PASS = 'pw-123'

// ── detectBackupType ───────────────────────────────────────────

describe('detectBackupType', () => {
  it('평문 ExportSchema → plain (기존 백업 호환)', () => {
    expect(detectBackupType(JSON.stringify(makeSchema()))).toBe('plain')
  })

  it('봉투(암호화 백업) → encrypted', async () => {
    const backup = await wrapEnvelope(makeSchema(), PASS)
    expect(detectBackupType(JSON.stringify(backup))).toBe('encrypted')
  })

  it('잘못된 JSON → invalid', () => {
    expect(detectBackupType('{not json')).toBe('invalid')
  })

  it('JSON이지만 백업 형식 아님 → invalid', () => {
    expect(detectBackupType(JSON.stringify({ foo: 'bar' }))).toBe('invalid')
  })
})

// ── decryptBackup ──────────────────────────────────────────────

describe('decryptBackup', () => {
  it('올바른 패스프레이즈 → 평문 ExportSchema JSON 반환 (라운드트립)', async () => {
    const schema = makeSchema()
    const backup = await wrapEnvelope(schema, PASS)
    const plain = await decryptBackup(JSON.stringify(backup), PASS)
    expect(JSON.parse(plain)).toEqual(schema)
  })

  it('틀린 패스프레이즈 → 친절한 에러', async () => {
    const backup = await wrapEnvelope(makeSchema(), PASS)
    await expect(decryptBackup(JSON.stringify(backup), 'wrong')).rejects.toThrow(
      /패스프레이즈/,
    )
  })

  it('봉투가 아닌 평문 입력 → 에러', async () => {
    await expect(decryptBackup(JSON.stringify(makeSchema()), PASS)).rejects.toThrow(
      /암호화된 백업/,
    )
  })
})
