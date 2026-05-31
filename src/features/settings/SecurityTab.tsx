// src/features/settings/SecurityTab.tsx
//
// 환경설정 보안 탭
// - 암호화 활성화/비활성화 (패스프레이즈 입력)
// - 세션 잠금 해제 (앱 재시작 후 재입력)
// - 패스프레이즈 변경

import { useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { db } from '../../core/db'
import { generateSalt, deriveKey, saltToHex, hexToSalt } from '../../core/crypto'
import { encryptContent, decryptContent, isEncryptedContent } from '../../core/content'
import { encryptionKeyAtom, appConfigAtom } from '../../store/atoms'

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

      await db.config.update(1, { encryptionEnabled: true, encryptionSalt: saltHex })
      setConfig((prev) => prev ? { ...prev, encryptionEnabled: true, encryptionSalt: saltHex } : prev)
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

      // 첫 번째 암호화 항목으로 검증
      const firstEncrypted = await db.items
        .filter((item) => isEncryptedContent(item.content))
        .first()

      if (firstEncrypted) {
        // 패스프레이즈 검증 — 복호화 실패 시 예외 발생
        await decryptContent(firstEncrypted.content, key)
      }

      setEncryptionKey(key)
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
      const salt = hexToSalt(config.encryptionSalt)
      const verifyKey = await deriveKey(passphrase, salt)
      const firstEncrypted = await db.items
        .filter((item) => isEncryptedContent(item.content))
        .first()
      if (firstEncrypted) {
        await decryptContent(firstEncrypted.content, verifyKey)
      }

      // 모든 암호화 항목 복호화
      const items = await db.items.toArray()
      for (const item of items) {
        if (isEncryptedContent(item.content)) {
          const plain = await decryptContent(item.content, encryptionKey)
          await db.items.update(item.id, { content: plain })
        }
      }

      await db.config.update(1, { encryptionEnabled: false, encryptionSalt: null })
      setConfig((prev) => prev ? { ...prev, encryptionEnabled: false, encryptionSalt: null } : prev)
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
      const oldSalt = hexToSalt(config.encryptionSalt)
      const oldKey = await deriveKey(passphrase, oldSalt)
      const firstEncrypted = await db.items
        .filter((item) => isEncryptedContent(item.content))
        .first()
      if (firstEncrypted) {
        await decryptContent(firstEncrypted.content, oldKey)
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

      await db.config.update(1, { encryptionSalt: newSaltHex })
      setConfig((prev) => prev ? { ...prev, encryptionSalt: newSaltHex } : prev)
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
          <li>· 카드 제목·태그는 검색 기능 유지를 위해 평문으로 저장됩니다</li>
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
