// src/features/settings/SecurityTab.tsx
//
// 환경설정 보안 탭
// - 암호화 활성화/비활성화 (패스프레이즈 입력)
// - 세션 잠금 해제 (앱 재시작 후 재입력)
// - 패스프레이즈 변경

import { useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { db } from '../../core/db'
import { generateSalt, deriveKey, saltToHex, hexToSalt, makeCanary } from '../../core/crypto'
import { encryptContent, decryptContent, isEncryptedContent } from '../../core/content'
import { encryptionKeyAtom, appConfigAtom } from '../../store/atoms'
import { backfillMeta, decryptAllMeta, reencryptMeta } from '../../core/metaStore'
import { bumpAllDraftEpochs } from '../cards/draftFlushControl'
import { verifyPassphrase } from './passphraseVerify'

type SecurityState = 'idle' | 'enabling' | 'unlocking' | 'disabling' | 'changing'

export function SecurityTab() {
  const config = useAtomValue(appConfigAtom)
  const [encryptionKey, setEncryptionKey] = useAtom(encryptionKeyAtom)
  const setConfig = useSetAtom(appConfigAtom)

  const [state, setState] = useState<SecurityState>('idle')
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [newPass, setNewPass] = useState('')
  const [newConfirm, setNewConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const isEnabled = config?.encryptionEnabled ?? false
  const isUnlocked = encryptionKey !== null

  function flash(msg: string) {
    setDone(msg)
    setTimeout(() => setDone(null), 3000)
  }

  function resetForm() {
    setPassphrase('')
    setConfirm('')
    setNewPass('')
    setNewConfirm('')
    setError(null)
    setState('idle')
  }

  // ── 암호화 활성화 ─────────────────────────────────────────────

  async function handleEnable() {
    if (passphrase.length < 8) {
      setError('패스프레이즈는 8자 이상이어야 합니다')
      return
    }
    if (passphrase !== confirm) {
      setError('패스프레이즈가 일치하지 않습니다')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const salt = generateSalt()
      const key = await deriveKey(passphrase, salt)
      const saltHex = saltToHex(salt)

      // 기존 모든 아이템 content 암호화
      const items = await db.items.toArray()
      for (const item of items) {
        if (!isEncryptedContent(item.content)) {
          const encrypted = await encryptContent(item.content, key)
          await db.items.update(item.id, { content: encrypted })
        }
      }
      // 태그·폴더명도 같은 키로 암호화 — 여기를 빼면 content만 감춰지고 메타데이터는 평문으로 남는다
      await backfillMeta(key)

      // 카나리를 활성화 시점에 항상 기록 — 이후 암호화 대상(content/태그/폴더명)이
      // 뭐가 됐든 검증이 스킵되는 경우가 없어진다.
      const canary = await makeCanary(key)
      await db.config.update(1, { encryptionEnabled: true, encryptionSalt: saltHex, encryptionCheck: canary })
      // 방금 암호화된 아이템의 평문 드래프트가 있었다면 isDraftPersistable이 false로
      // 바뀌어 앞으로 절대 로드되지도 정리되지도 않는 좀비가 된다 — 활성화 시점에 일괄 정리.
      // bumpAllDraftEpochs는 in-flight 중이던 flush(예: 방금까지 평문으로 encrypt 없이 진행되던
      // saveDraftRaw 호출)가 clear() 이후 도착해 좀비를 되살리는 것도 막는다.
      await db.drafts.clear()
      bumpAllDraftEpochs()
      setConfig((prev) => prev ? { ...prev, encryptionEnabled: true, encryptionSalt: saltHex, encryptionCheck: canary } : prev)
      setEncryptionKey(key)
      flash('암호화가 활성화되었습니다')
      resetForm()
    } catch {
      setError('암호화 활성화 중 오류가 발생했습니다')
    } finally {
      setBusy(false)
    }
  }

  // ── 잠금 해제 (앱 재시작 후) ──────────────────────────────────

  async function handleUnlock() {
    if (!config?.encryptionSalt) {
      setError('salt 정보가 없습니다. 암호화를 다시 설정해 주세요')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const salt = hexToSalt(config.encryptionSalt)
      const key = await deriveKey(passphrase, salt)

      const verdict = await verifyPassphrase(key, config)
      if (verdict === 'failed') {
        setError('패스프레이즈가 올바르지 않습니다')
        return
      }

      setEncryptionKey(key)

      // 백필은 DB 업그레이드가 아니라 여기서 돈다 — 업그레이드 시점엔 키가 없기 때문.
      // 멱등이라 중간에 실패해도 다음 잠금 해제에서 이어지므로, 잠금 해제 자체는 성공 처리한다.
      try {
        await backfillMeta(key)
      } catch {
        // 백필 실패가 "패스프레이즈 오류"로 보고되면 안 된다 — 다음 해제 때 재시도된다
      }

      // 레거시 설치(v20 이전에 활성화)는 카나리가 없다 — 이번에 실제로 검증된 키로
      // 소급 기록한다. verdict가 'unverifiable'(완전히 빈 암호화 상태)이면 이 키가
      // 맞다는 근거가 없으므로 기록하지 않는다 — 잘못 기록하면 다음번 진짜 올바른
      // 패스프레이즈가 오히려 카나리 불일치로 거부된다.
      if (!config.encryptionCheck && verdict === 'verified') {
        const canary = await makeCanary(key)
        await db.config.update(1, { encryptionCheck: canary })
        setConfig((prev) => prev ? { ...prev, encryptionCheck: canary } : prev)
      }

      flash('잠금이 해제되었습니다')
      resetForm()
    } catch {
      setError('패스프레이즈가 올바르지 않습니다')
    } finally {
      setBusy(false)
    }
  }

  // ── 암호화 비활성화 ───────────────────────────────────────────

  async function handleDisable() {
    if (!encryptionKey || !config?.encryptionSalt) {
      setError('먼저 잠금을 해제해 주세요')
      return
    }
    if (passphrase !== confirm) {
      setError('패스프레이즈가 일치하지 않습니다')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // 패스프레이즈 검증 — 현재 키와 일치하는지 확인
      // (verdict가 'unverifiable'이면 검증할 암호문 자체가 없다는 뜻 — 그 경우
      // 이 아래 복호화 루프도 손댈 게 없어 그대로 통과시켜도 안전하다)
      const salt = hexToSalt(config.encryptionSalt)
      const verifyKey = await deriveKey(passphrase, salt)
      if ((await verifyPassphrase(verifyKey, config)) === 'failed') {
        setError('패스프레이즈가 올바르지 않습니다')
        return
      }

      // 모든 암호화 항목 복호화
      const items = await db.items.toArray()
      for (const item of items) {
        if (isEncryptedContent(item.content)) {
          const plain = await decryptContent(item.content, encryptionKey)
          await db.items.update(item.id, { content: plain })
        }
      }
      // 태그·폴더명도 평문으로 되돌린다 — 빠뜨리면 암호화를 껐는데 태그·폴더명이
      // 복호화 키 없이 영원히 읽을 수 없는 암호문으로 남는다
      await decryptAllMeta(encryptionKey)

      await db.config.update(1, { encryptionEnabled: false, encryptionSalt: null, encryptionCheck: null })
      // 드래프트는 옛 키로 암호화되어 있었을 수 있어 비활성화 후엔 복호화 불가능한 좀비가 된다 — 일괄 정리.
      // bumpAllDraftEpochs로 in-flight 암호화 flush가 clear() 이후 도착해 좀비를 되살리는 것도 막는다.
      await db.drafts.clear()
      bumpAllDraftEpochs()
      setConfig((prev) => prev ? { ...prev, encryptionEnabled: false, encryptionSalt: null, encryptionCheck: null } : prev)
      setEncryptionKey(null)
      flash('암호화가 비활성화되었습니다')
      resetForm()
    } catch {
      setError('복호화 중 오류가 발생했습니다')
    } finally {
      setBusy(false)
    }
  }

  // ── 패스프레이즈 변경 ─────────────────────────────────────────

  async function handleChangePassphrase() {
    if (!encryptionKey || !config?.encryptionSalt) return
    if (newPass.length < 8) {
      setError('새 패스프레이즈는 8자 이상이어야 합니다')
      return
    }
    if (newPass !== newConfirm) {
      setError('새 패스프레이즈가 일치하지 않습니다')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // 현재 패스프레이즈 검증
      // (verdict가 'unverifiable'이면 재암호화할 암호문도 없다는 뜻 — reencryptMeta는
      // 빈 루프로 끝나고, 아래에서 새 카나리를 이번 키로 발급해 다음번부터는 검증 가능해진다)
      const oldSalt = hexToSalt(config.encryptionSalt)
      const oldKey = await deriveKey(passphrase, oldSalt)
      if ((await verifyPassphrase(oldKey, config)) === 'failed') {
        setError('현재 패스프레이즈가 올바르지 않습니다')
        return
      }

      // 새 salt + key 생성
      const newSalt = generateSalt()
      const newKey = await deriveKey(newPass, newSalt)
      const newSaltHex = saltToHex(newSalt)

      // 기존 암호화 → 복호화 → 새 키로 재암호화
      const items = await db.items.toArray()
      for (const item of items) {
        if (isEncryptedContent(item.content)) {
          const plain = await decryptContent(item.content, oldKey)
          const reEncrypted = await encryptContent(plain, newKey)
          await db.items.update(item.id, { content: reEncrypted })
        }
      }
      // 태그·폴더명도 새 키로 교체 — 이 한 줄이 없으면 패스프레이즈 변경이
      // 모든 태그·폴더명을 복구 불능으로 만든다(옛 키는 세션에서 사라진다)
      await reencryptMeta(oldKey, newKey)

      // 카나리도 새 키로 갱신 — 옛 카나리가 남으면 다음 검증이 새 키를 거부한다
      const newCanary = await makeCanary(newKey)
      await db.config.update(1, { encryptionSalt: newSaltHex, encryptionCheck: newCanary })
      // 드래프트는 이전 키(oldKey)로 암호화되어 있어 새 키로는 복호화 불가능한 좀비가 된다 — 일괄 정리.
      // bumpAllDraftEpochs로 in-flight 암호화 flush가 clear() 이후 도착해 좀비를 되살리는 것도 막는다.
      await db.drafts.clear()
      bumpAllDraftEpochs()
      setConfig((prev) => prev ? { ...prev, encryptionSalt: newSaltHex, encryptionCheck: newCanary } : prev)
      setEncryptionKey(newKey)
      flash('패스프레이즈가 변경되었습니다')
      resetForm()
    } catch {
      setError('현재 패스프레이즈가 올바르지 않거나 오류가 발생했습니다')
    } finally {
      setBusy(false)
    }
  }

  // ── 렌더링 ────────────────────────────────────────────────────

  const statusBadge = !isEnabled
    ? <span className="rounded-full bg-[var(--bg-input)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">비활성화</span>
    : isUnlocked
    ? <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-500">활성화 · 잠금 해제됨</span>
    : <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-500">활성화 · 잠김</span>

  return (
    <div className="space-y-6">

      {/* ── 상태 표시 ── */}
      <section>
        <h3 className="section-label">암호화 상태</h3>
        <div className="flex items-center gap-3">
          {statusBadge}
          <span className="text-xs text-[var(--text-tertiary)]">
            {!isEnabled
              ? 'IndexedDB 데이터가 평문으로 저장됩니다'
              : isUnlocked
              ? '카드 콘텐츠가 AES-GCM으로 암호화됩니다'
              : '앱 재시작 후 잠겼습니다. 패스프레이즈를 입력해 주세요'}
          </span>
        </div>
      </section>

      {done && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm text-green-500">
          {done}
        </div>
      )}

      {/* ── 암호화 비활성 → 활성화 폼 ── */}
      {!isEnabled && state === 'idle' && (
        <section>
          <h3 className="section-label">암호화 활성화</h3>
          <button
            type="button"
            onClick={() => setState('enabling')}
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            암호화 설정하기
          </button>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            패스프레이즈는 잃어버리면 데이터를 복구할 수 없습니다.
          </p>
        </section>
      )}

      {!isEnabled && state === 'enabling' && (
        <section>
          <h3 className="section-label">패스프레이즈 설정</h3>
          <div className="space-y-3">
            <PassInput label="패스프레이즈" value={passphrase} onChange={setPassphrase} placeholder="8자 이상" />
            <PassInput label="확인" value={confirm} onChange={setConfirm} placeholder="동일하게 입력" />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <ActionButton onClick={() => void handleEnable()} busy={busy} label="활성화" />
              <CancelButton onClick={resetForm} />
            </div>
          </div>
        </section>
      )}

      {/* ── 암호화 활성 + 잠김 → 잠금 해제 폼 ── */}
      {isEnabled && !isUnlocked && (
        <section>
          <h3 className="section-label">잠금 해제</h3>
          <div className="space-y-3">
            <PassInput label="패스프레이즈" value={passphrase} onChange={setPassphrase} placeholder="설정 시 입력한 패스프레이즈" />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <ActionButton onClick={() => void handleUnlock()} busy={busy} label="잠금 해제" />
          </div>
        </section>
      )}

      {/* ── 암호화 활성 + 잠금 해제됨 → 관리 메뉴 ── */}
      {isEnabled && isUnlocked && (
        <>
          {/* 패스프레이즈 변경 */}
          <section>
            <h3 className="section-label">패스프레이즈 변경</h3>
            {state !== 'changing' ? (
              <button
                type="button"
                onClick={() => setState('changing')}
                className="text-sm text-[var(--text-active)] hover:underline"
              >
                변경하기
              </button>
            ) : (
              <div className="space-y-3">
                <PassInput label="현재 패스프레이즈" value={passphrase} onChange={setPassphrase} placeholder="" />
                <PassInput label="새 패스프레이즈" value={newPass} onChange={setNewPass} placeholder="8자 이상" />
                <PassInput label="새 패스프레이즈 확인" value={newConfirm} onChange={setNewConfirm} placeholder="동일하게 입력" />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="flex gap-2">
                  <ActionButton onClick={() => void handleChangePassphrase()} busy={busy} label="변경" />
                  <CancelButton onClick={resetForm} />
                </div>
              </div>
            )}
          </section>

          {/* 암호화 비활성화 */}
          <section>
            <h3 className="section-label">암호화 비활성화</h3>
            {state !== 'disabling' ? (
              <button
                type="button"
                onClick={() => setState('disabling')}
                className="text-sm text-red-500 hover:underline"
              >
                비활성화하기
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-[var(--text-secondary)]">
                  비활성화 시 모든 카드 콘텐츠가 평문으로 저장됩니다. 확인을 위해 패스프레이즈를 다시 입력해 주세요.
                </p>
                <PassInput label="패스프레이즈" value={passphrase} onChange={setPassphrase} placeholder="" />
                <PassInput label="확인" value={confirm} onChange={setConfirm} placeholder="동일하게 입력" />
                {error && <p className="text-xs text-red-500">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDisable()}
                    disabled={busy}
                    className="rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
                  >
                    {busy ? '처리 중...' : '비활성화'}
                  </button>
                  <CancelButton onClick={resetForm} />
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* 보안 안내 */}
      <section>
        <h3 className="section-label">보안 안내</h3>
        <ul className="space-y-1 text-xs text-[var(--text-tertiary)]">
          <li>· 패스프레이즈는 브라우저 메모리에만 유지되며 앱 종료 시 소멸합니다</li>
          <li>· AES-256-GCM + PBKDF2(100,000회 반복)로 키를 파생합니다</li>
          <li>· 카드 제목은 검색 기능 유지를 위해 평문으로 저장됩니다. 태그·폴더명은 암호화됩니다</li>
          <li>· 패스프레이즈 분실 시 콘텐츠 복구는 불가능합니다</li>
        </ul>
      </section>

    </div>
  )
}

// ── 공용 소형 컴포넌트 ──────────────────────────────────────────

function PassInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-sm text-[var(--text-primary)]">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:ring-1 focus:ring-[var(--border-accent)]"
      />
    </div>
  )
}

function ActionButton({
  onClick,
  busy,
  label,
}: {
  onClick: () => void
  busy: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50 hover:opacity-90"
    >
      {busy ? '처리 중...' : label}
    </button>
  )
}

function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-[var(--border-default)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
    >
      취소
    </button>
  )
}
