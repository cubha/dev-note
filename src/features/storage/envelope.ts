// src/features/storage/envelope.ts
//
// 봉투(envelope) 암호화 — 백업 파일 전체를 AES-GCM으로 감싼다.
// - 기존 content 필드별 암호화({enc:1,ct})와 직교: 봉투는 ExportSchema JSON 전체를 통째로 암호화
// - 평문 백업 호환 유지: 봉투가 아닌 일반 ExportSchema는 그대로 가져오기 가능
// - 비번 검증은 별도 해시 없이 AES-GCM 인증 태그 실패로 판정

import type { ExportSchema } from './schema'
import {
  deriveKey,
  encrypt,
  decrypt,
  generateSalt,
  saltToHex,
  hexToSalt,
  PBKDF2_ITERATIONS,
} from '../../core/crypto'

const BACKUP_FORMAT = 'devnote-encrypted-backup'
const BACKUP_VERSION = 1
// 복호화 시 허용하는 PBKDF2 반복 최소값 (다운그레이드/약한 파라미터 봉투 거부).
// 기본값(PBKDF2_ITERATIONS)을 향후 상향해도 구버전 백업 호환을 위해 floor는 고정한다.
const MIN_BACKUP_ITERATIONS = 100_000

export interface EncryptedBackup {
  format: typeof BACKUP_FORMAT
  version: number
  kdf: 'PBKDF2'
  iterations: number
  salt: string // hex — 백업 전용 새 salt (AppConfig.encryptionSalt와 무관)
  ciphertext: string // crypto.encrypt(JSON.stringify(ExportSchema), key)
}

/** 파싱된 데이터가 봉투(암호화 백업) 형식인지 확인 — isValidExportSchema 가드보다 먼저 호출 */
export function isEncryptedBackup(data: unknown): data is EncryptedBackup {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    obj.format === BACKUP_FORMAT &&
    typeof obj.version === 'number' &&
    obj.kdf === 'PBKDF2' &&
    typeof obj.iterations === 'number' &&
    typeof obj.salt === 'string' &&
    typeof obj.ciphertext === 'string'
  )
}

/** ExportSchema 전체를 패스프레이즈로 암호화하여 봉투로 감싼다. */
export async function wrapEnvelope(
  schema: ExportSchema,
  passphrase: string,
): Promise<EncryptedBackup> {
  const salt = generateSalt()
  // 기록값과 사용값이 어긋나지 않도록 상수를 명시적으로 전달
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS)
  const ciphertext = await encrypt(JSON.stringify(schema), key)
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: 'PBKDF2',
    iterations: PBKDF2_ITERATIONS,
    salt: saltToHex(salt),
    ciphertext,
  }
}

/** 봉투를 복호화하여 원본 ExportSchema를 복원한다. 패스프레이즈가 틀리면 친절한 에러를 throw. */
export async function unwrapEnvelope(
  backup: EncryptedBackup,
  passphrase: string,
): Promise<ExportSchema> {
  // 약한 파라미터/다운그레이드 봉투 거부 (정상 백업은 항상 floor 이상)
  if (backup.iterations < MIN_BACKUP_ITERATIONS) {
    throw new Error('백업 파일의 보안 파라미터가 유효하지 않습니다')
  }
  const salt = hexToSalt(backup.salt)
  // 봉투에 기록된 iterations로 키 파생 (crypto-agility: 향후 반복 횟수 변경에도 구버전 백업 복호화)
  const key = await deriveKey(passphrase, salt, backup.iterations)
  let plaintext: string
  try {
    plaintext = await decrypt(backup.ciphertext, key)
  } catch {
    // AES-GCM 인증 태그 실패 = 패스프레이즈 불일치 (또는 손상된 파일)
    throw new Error('패스프레이즈가 올바르지 않거나 백업 파일이 손상되었습니다')
  }
  return JSON.parse(plaintext) as ExportSchema
}
