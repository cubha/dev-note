// src/features/sync/syncSession.ts
//
// 동기화 세션 — 프로바이더 인스턴스와 DEK(노트 키)를 세션 메모리에 보관한다.
// 모듈 싱글톤: 설정 모달을 닫았다 열어도 연결 상태가 유지된다.
// 토큰·DEK는 절대 영속 저장하지 않는다(메모리 한정 = 프로젝트 하드룰).

import { db, ensureConfig } from '../../core/db'
import { createGoogleDriveProvider, GoogleDriveProvider } from './providers/GoogleDriveProvider'
import { setupSync, unlockDevice, changePassphrase } from './keyManager'
import { runSync } from './syncEngine'
import type { SyncResult } from './syncEngine'

/** 동기화 패스프레이즈 최소 길이 (오프라인 무차별 대입 비용 보완) */
export const MIN_SYNC_PASSPHRASE = 12

let provider: GoogleDriveProvider | null = null
let dek: string | null = null // unlock된 DEK(base64). 메모리 전용.

function getProvider(): GoogleDriveProvider {
  if (!provider) provider = createGoogleDriveProvider()
  return provider
}

export function isUnlocked(): boolean {
  return dek !== null
}

/** Google Drive 인증 + 최초 설정(setup) 또는 기기 연결(unlock). interactive=true면 동의 UI 허용. */
export async function connect(
  passphrase: string,
  mode: 'setup' | 'unlock',
): Promise<void> {
  if (mode === 'setup' && passphrase.length < MIN_SYNC_PASSPHRASE) {
    throw new Error(`패스프레이즈는 최소 ${MIN_SYNC_PASSPHRASE}자 이상이어야 합니다`)
  }
  const p = getProvider()
  await p.authenticate(true)
  const keys = mode === 'setup'
    ? await setupSync(p, passphrase)
    : await unlockDevice(p, passphrase)
  dek = keys.dek
  const cfg = await ensureConfig()
  await db.config.update(cfg.id, { syncEnabled: true, syncProvider: 'google-drive' })
}

/** 원격에 이미 설정(meta.json)이 있는지 — UI가 setup/unlock 분기 결정에 사용. */
export async function remoteIsInitialized(): Promise<boolean> {
  const p = getProvider()
  await p.authenticate(true)
  return (await p.get('meta.json')) !== null
}

export async function changeSyncPassphrase(oldPass: string, newPass: string): Promise<void> {
  if (newPass.length < MIN_SYNC_PASSPHRASE) {
    throw new Error(`새 패스프레이즈는 최소 ${MIN_SYNC_PASSPHRASE}자 이상이어야 합니다`)
  }
  const p = getProvider()
  const keys = await changePassphrase(p, oldPass, newPass)
  dek = keys.dek
}

/** 1회 동기화 실행. 연결/잠금 해제 상태여야 한다. */
export async function syncNow(now: number): Promise<SyncResult> {
  if (!dek) throw new Error('동기화 잠금이 해제되지 않았습니다 — 패스프레이즈로 연결해 주세요')
  return runSync(getProvider(), dek, (await ensureConfig()).deviceId, now)
}

export async function disconnect(): Promise<void> {
  provider?.signOut()
  provider = null
  dek = null
  const cfg = await ensureConfig()
  await db.config.update(cfg.id, { syncEnabled: false })
}
