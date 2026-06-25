import { describe, it, expect } from 'vitest'
import {
  setupSync,
  unlockDevice,
  changePassphrase,
  META_FILE,
} from '../features/sync/keyManager'
import { isSyncMeta } from '../features/sync/sync-schema'
import type { StorageProvider, RemoteFile } from '../features/sync/providers/StorageProvider'
import { encrypt } from '../core/crypto'
import { importDEK } from '../core/sync-crypto'

// 메모리 기반 가짜 프로바이더 — 네트워크 없이 keyManager 계약만 검증
class FakeProvider implements StorageProvider {
  readonly id = 'google-drive' as const
  files = new Map<string, string>()
  authenticate(): Promise<void> { return Promise.resolve() }
  isAuthenticated(): boolean { return true }
  list(): Promise<RemoteFile[]> {
    return Promise.resolve(
      [...this.files.keys()].map((name) => ({ name, id: name, modifiedTime: 0 })),
    )
  }
  get(name: string): Promise<string | null> {
    return Promise.resolve(this.files.get(name) ?? null)
  }
  put(name: string, content: string): Promise<void> {
    this.files.set(name, content)
    return Promise.resolve()
  }
  remove(name: string): Promise<void> {
    this.files.delete(name)
    return Promise.resolve()
  }
  signOut(): void { this.files.clear() }
}

const PASS = 'correct horse battery staple'

describe('setupSync', () => {
  it('meta.json을 생성하고 DEK를 반환', async () => {
    const p = new FakeProvider()
    const { dek, noteKey } = await setupSync(p, PASS)
    expect(dek.length).toBeGreaterThan(0)
    expect(noteKey).toBeInstanceOf(CryptoKey)
    const meta = JSON.parse(p.files.get(META_FILE) as string)
    expect(isSyncMeta(meta)).toBe(true)
  })

  it('이미 설정된 저장소면 거부 (다른 기기 → unlock 사용)', async () => {
    const p = new FakeProvider()
    await setupSync(p, PASS)
    await expect(setupSync(p, 'another')).rejects.toThrow(/이미 동기화/)
  })
})

describe('unlockDevice', () => {
  it('같은 패스프레이즈로 동일 DEK 복원 (다기기 시나리오)', async () => {
    const p = new FakeProvider()
    const a = await setupSync(p, PASS)
    const b = await unlockDevice(p, PASS) // 다른 기기가 같은 저장소 연결
    expect(b.dek).toBe(a.dek)
  })

  it('틀린 패스프레이즈 → 거부', async () => {
    const p = new FakeProvider()
    await setupSync(p, PASS)
    await expect(unlockDevice(p, 'wrong')).rejects.toThrow(/패스프레이즈/)
  })

  it('미설정 저장소 → 거부', async () => {
    await expect(unlockDevice(new FakeProvider(), PASS)).rejects.toThrow(/설정되지 않은/)
  })

  it('손상된 verifyToken → 검증 실패', async () => {
    const p = new FakeProvider()
    const { dek } = await setupSync(p, PASS)
    // 같은 DEK로 만든 "다른 상수" 토큰으로 교체 → unwrap은 성공하나 검증 불일치
    const meta = JSON.parse(p.files.get(META_FILE) as string)
    meta.verifyToken = await encrypt('wrong-constant', await importDEK(dek))
    p.files.set(META_FILE, JSON.stringify(meta))
    await expect(unlockDevice(p, PASS)).rejects.toThrow(/검증/)
  })
})

describe('changePassphrase', () => {
  it('DEK는 유지하고 새 패스프레이즈로 unlock 가능, 옛 패스프레이즈는 불가', async () => {
    const p = new FakeProvider()
    const before = await setupSync(p, PASS)
    const after = await changePassphrase(p, PASS, 'new-pass-9999')
    expect(after.dek).toBe(before.dek) // 노트 재암호화 불필요
    expect((await unlockDevice(p, 'new-pass-9999')).dek).toBe(before.dek)
    await expect(unlockDevice(p, PASS)).rejects.toThrow()
  })
})
