import { describe, it, expect, beforeEach } from 'vitest'
import { db, ensureConfig } from '../core/db'

describe('ensureConfig — v20 encryptionCheck 필드', () => {
  beforeEach(async () => {
    await db.config.clear()
  })

  it('신규 설치는 encryptionCheck: null로 초기화된다', async () => {
    const config = await ensureConfig()
    expect(config.encryptionCheck).toBeNull()
  })
})
