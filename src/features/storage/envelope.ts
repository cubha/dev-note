// src/features/storage/envelope.ts
//
// 봉투(envelope) 암호화 — 백업 파일 전체를 AES-GCM으로 감싼다.
// - 기존 content 필드별 암호화({enc:1,ct})와 직교: 봉투는 ExportSchema JSON 전체를 통째로 암호화
// - 평문 백업 호환 유지: 봉투가 아닌 일반 ExportSchema는 그대로 가져오기 가능
// - 비번 검증은 별도 해시 없이 AES-GCM 인증 태그 실패로 판정

import type { ExportSchema } from './schema'

// stub — SubTask 1 GREEN에서 구현
export interface EncryptedBackup {
  format: 'devnote-encrypted-backup'
  version: number
  kdf: 'PBKDF2'
  iterations: number
  salt: string
  ciphertext: string
}

export function isEncryptedBackup(_data: unknown): _data is EncryptedBackup {
  throw new Error('not implemented')
}

export async function wrapEnvelope(
  _schema: ExportSchema,
  _passphrase: string,
): Promise<EncryptedBackup> {
  throw new Error('not implemented')
}

export async function unwrapEnvelope(
  _backup: EncryptedBackup,
  _passphrase: string,
): Promise<ExportSchema> {
  throw new Error('not implemented')
}
