import { describe, it, expect } from 'vitest'
import {
  isEncryptedNoteFile,
  isSyncManifest,
  isSyncMeta,
  emptyManifest,
} from '../features/sync/sync-schema'
import type {
  EncryptedNoteFile,
  SyncManifest,
  SyncMeta,
} from '../features/sync/sync-schema'

const validNoteFile: EncryptedNoteFile = {
  format: 'devnote-note',
  version: 1,
  uuid: 'u-1',
  noteVersion: 'hash-abc',
  ciphertext: 'base64ct',
  updatedAt: 123,
}

const validManifest: SyncManifest = {
  format: 'devnote-manifest',
  version: 1,
  updatedAt: 123,
  notes: { 'u-1': { version: 'hash-abc', updatedAt: 123 } },
  tombstones: { 'u-2': { deletedAt: 456 } },
}

const validMeta: SyncMeta = {
  format: 'devnote-sync-meta',
  version: 1,
  kdf: 'PBKDF2',
  iterations: 100_000,
  salt: 'deadbeef',
  wrappedDEK: 'base64wrapped',
  verifyToken: 'base64token',
}

describe('isEncryptedNoteFile', () => {
  it('유효한 노트 파일 → true', () => {
    expect(isEncryptedNoteFile(validNoteFile)).toBe(true)
  })
  it('format 불일치/필드 누락/null → false', () => {
    expect(isEncryptedNoteFile({ ...validNoteFile, format: 'x' })).toBe(false)
    expect(isEncryptedNoteFile({ ...validNoteFile, ciphertext: 1 })).toBe(false)
    expect(isEncryptedNoteFile(null)).toBe(false)
    expect(isEncryptedNoteFile('str')).toBe(false)
  })
})

describe('isSyncManifest', () => {
  it('유효한 manifest(notes+tombstones) → true', () => {
    expect(isSyncManifest(validManifest)).toBe(true)
  })
  it('빈 notes/tombstones도 유효', () => {
    expect(isSyncManifest({ ...validManifest, notes: {}, tombstones: {} })).toBe(true)
  })
  it('notes가 객체 아님/format 불일치 → false', () => {
    expect(isSyncManifest({ ...validManifest, notes: [] })).toBe(false)
    expect(isSyncManifest({ ...validManifest, format: 'x' })).toBe(false)
    expect(isSyncManifest(null)).toBe(false)
  })
})

describe('isSyncMeta', () => {
  it('유효한 meta → true', () => {
    expect(isSyncMeta(validMeta)).toBe(true)
  })
  it('wrappedDEK/salt 누락 → false', () => {
    expect(isSyncMeta({ ...validMeta, wrappedDEK: undefined })).toBe(false)
    expect(isSyncMeta({ ...validMeta, salt: 1 })).toBe(false)
    expect(isSyncMeta(null)).toBe(false)
  })
})

describe('emptyManifest', () => {
  it('빈 notes/tombstones와 주어진 시각으로 manifest 생성', () => {
    const m = emptyManifest(999)
    expect(isSyncManifest(m)).toBe(true)
    expect(m.notes).toEqual({})
    expect(m.tombstones).toEqual({})
    expect(m.updatedAt).toBe(999)
  })
})
