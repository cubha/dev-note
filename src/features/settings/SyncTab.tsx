// src/features/settings/SyncTab.tsx
//
// 동기화 설정 탭 (Phase 2 BYO-storage)
// - Google Drive(appDataFolder) 연결 + 패스프레이즈(zero-knowledge DEK/KEK)
// - 메타데이터 노출 한계를 정직하게 고지(zero-knowledge = 콘텐츠 한정)
// - 토큰·DEK는 메모리 전용. AI 기능처럼 완전 선택적(미설정 시 핵심 CRUD 무영향).

import { useAtom } from 'jotai'
import { useCallback, useState } from 'react'
import { appConfigAtom, syncStatusAtom, syncLastErrorAtom, syncLastAtAtom } from '../../store/atoms'
import {
  connect,
  disconnect,
  syncNow,
  remoteIsInitialized,
  isUnlocked,
} from '../../features/sync/syncSession'
import type { SyncResult } from '../../features/sync/syncEngine'

const MIN_PASS = 12

export const SyncTab = () => {
  const [config, setConfig] = useAtom(appConfigAtom)
  const [status, setStatus] = useAtom(syncStatusAtom)
  const [error, setError] = useAtom(syncLastErrorAtom)
  const [lastAt, setLastAt] = useAtom(syncLastAtAtom)

  const [passphrase, setPassphrase] = useState('')
  const [mode, setMode] = useState<'setup' | 'unlock' | null>(null)
  const [result, setResult] = useState<SyncResult | null>(null)

  const syncEnabled = config?.syncEnabled ?? false
  const unlocked = isUnlocked()

  // 연결 시작 — 원격에 meta.json 유무로 setup/unlock 분기
  const handleStartConnect = useCallback(async () => {
    setError(null)
    setStatus('syncing')
    try {
      const initialized = await remoteIsInitialized()
      setMode(initialized ? 'unlock' : 'setup')
      setStatus('locked')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : '연결에 실패했습니다')
    }
  }, [setError, setStatus])

  const handleConfirm = useCallback(async () => {
    if (!mode) return
    if (passphrase.length < MIN_PASS) {
      setError(`패스프레이즈는 최소 ${MIN_PASS}자 이상이어야 합니다`)
      return
    }
    setError(null)
    setStatus('syncing')
    try {
      await connect(passphrase, mode)
      setPassphrase('')
      setMode(null)
      setConfig((prev) => (prev ? { ...prev, syncEnabled: true, syncProvider: 'google-drive' } : prev))
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : '인증/잠금 해제에 실패했습니다')
    }
  }, [mode, passphrase, setConfig, setError, setStatus])

  const handleSyncNow = useCallback(async () => {
    setError(null)
    setStatus('syncing')
    try {
      const r = await syncNow(Date.now())
      setResult(r)
      const now = Date.now()
      setLastAt(now)
      setConfig((prev) => (prev ? { ...prev, lastSyncAt: now } : prev))
      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : '동기화에 실패했습니다')
    }
  }, [setConfig, setError, setLastAt, setStatus])

  const handleDisconnect = useCallback(async () => {
    await disconnect()
    setConfig((prev) => (prev ? { ...prev, syncEnabled: false } : prev))
    setMode(null)
    setResult(null)
    setStatus('idle')
  }, [setConfig, setStatus])

  return (
    <div className="space-y-6">
      {/* ── 연결 섹션 ── */}
      <section>
        <h3 className="section-label">클라우드 동기화 (선택)</h3>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          내 Google Drive의 앱 전용 폴더에 <strong>암호화된</strong> 노트만 업로드합니다.
          여러 기기에서 같은 패스프레이즈로 열 수 있습니다. 기본값은 로컬 전용입니다.
        </p>

        {!syncEnabled && mode === null && (
          <button
            type="button"
            onClick={() => void handleStartConnect()}
            disabled={status === 'syncing'}
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {status === 'syncing' ? '연결 중…' : 'Google Drive 연결'}
          </button>
        )}

        {/* 패스프레이즈 입력 (setup/unlock) */}
        {mode !== null && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--text-primary)]">
              {mode === 'setup'
                ? '새 동기화 패스프레이즈를 설정하세요 (분실 시 복구 불가).'
                : '기존 동기화 패스프레이즈를 입력하세요.'}
            </p>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder={`패스프레이즈 (최소 ${MIN_PASS}자)`}
              className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={status === 'syncing'}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {mode === 'setup' ? '설정하고 연결' : '잠금 해제'}
              </button>
              <button
                type="button"
                onClick={() => { setMode(null); setPassphrase(''); setError(null) }}
                className="rounded bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              >
                취소
              </button>
            </div>
          </div>
        )}

        {/* 연결됨 상태 */}
        {syncEnabled && mode === null && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <span className="inline-block size-2 rounded-full bg-green-500" />
              Google Drive 연결됨{!unlocked && ' (이 세션에서 잠금 해제 필요)'}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleSyncNow()}
                disabled={status === 'syncing' || !unlocked}
                className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {status === 'syncing' ? '동기화 중…' : '지금 동기화'}
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                className="rounded bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)]"
              >
                연결 해제
              </button>
            </div>
            {!unlocked && (
              <button
                type="button"
                onClick={() => void handleStartConnect()}
                className="text-xs text-[var(--accent)] underline"
              >
                패스프레이즈로 잠금 해제
              </button>
            )}
          </div>
        )}

        {/* 결과 / 오류 / 시각 */}
        {result && (
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            동기화 완료 — 업로드 {result.pushed} · 다운로드 {result.pulled} · 충돌 {result.conflicts} · 삭제전파 {result.tombstoned} · 로컬삭제 {result.deletedLocal}
          </p>
        )}
        {lastAt && !result && (
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            마지막 동기화: {new Date(lastAt).toLocaleString()}
          </p>
        )}
        {error && <p className="mt-3 text-xs text-red-500">{error}</p>}
      </section>

      {/* ── 메타데이터 정직 고지 ── */}
      <section>
        <h3 className="section-label">개인정보 보호 범위</h3>
        <div className="rounded border border-[var(--border-default)] bg-[var(--bg-input)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
          <p className="mb-1">
            ✅ <strong>노트 내용·제목은 암호화</strong>되어 업로드됩니다. 저장소 제공자(Google)와
            DevNote 운영자 모두 평문을 볼 수 없습니다(zero-knowledge).
          </p>
          <p>
            ⚠️ 단, <strong>파일 개수·크기·동기화 시각</strong> 같은 메타데이터는 저장소 제공자에게
            노출됩니다. 파일명은 난수화되어 제목이 드러나지 않습니다.
          </p>
        </div>
      </section>
    </div>
  )
}
