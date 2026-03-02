// src/features/auth/MasterPasswordModal.tsx

import { useEffect, useRef, useState } from 'react'
import { useSetAtom } from 'jotai'
import type { AppConfig } from '../../core/db'
import { db } from '../../core/db'
import {
  deriveKey,
  encryptText,
  decryptText,
  generateSalt,
} from '../../core/crypto'
import { appConfigAtom, cryptoKeyAtom } from '../../store/atoms'

const CANARY_PLAINTEXT = 'DEV_NOTE_AUTH_CHECK'
const MIN_PASSWORD_LENGTH = 8

interface Props {
  mode: 'setup' | 'unlock'
  config: AppConfig
}

export function MasterPasswordModal({ mode, config }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const setCryptoKey = useSetAtom(cryptoKeyAtom)
  const setAppConfig = useSetAtom(appConfigAtom)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  const resetPasswordState = () => {
    setPassword('')
    setPasswordConfirm('')
    setError(null)
  }

  const handleSubmit = async () => {
    setError(null)
    setLoading(true)

    try {
      if (mode === 'setup') {
        if (password !== passwordConfirm) {
          setError('패스워드가 일치하지 않습니다.')
          return
        }
        if (password.length < MIN_PASSWORD_LENGTH) {
          setError(`패스워드는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`)
          return
        }

        const saltHex = generateSalt()
        const key = await deriveKey(password, saltHex)
        const { cipher, iv } = await encryptText(key, CANARY_PLAINTEXT)

        const updated: AppConfig = {
          ...config,
          cryptoEnabled: true,
          saltHex,
          canaryBlock: cipher,
          canaryIv: iv,
        }
        await db.config.put(updated)

        setAppConfig(updated)
        setCryptoKey(key)
        resetPasswordState()
      } else {
        const saltHex = config.saltHex
        const canaryBlock = config.canaryBlock
        const canaryIv = config.canaryIv

        if (!saltHex || !canaryBlock || !canaryIv) {
          setError('설정 오류: 암호화 데이터가 없습니다.')
          return
        }

        const key = await deriveKey(password, saltHex)
        const decrypted = await decryptText(key, canaryBlock, canaryIv)

        if (decrypted === CANARY_PLAINTEXT) {
          setCryptoKey(key)
          resetPasswordState()
        } else {
          setError('패스워드가 올바르지 않습니다.')
        }
      }
    } catch {
      setError('패스워드가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  const title = mode === 'setup' ? '마스터 패스워드 설정' : 'DevNote 잠금 해제'
  const description =
    mode === 'setup'
      ? '암호화가 활성화되면 노트 데이터가 패스워드로 보호됩니다. (최소 8자)'
      : '마스터 패스워드를 입력하여 잠금을 해제하세요.'

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 size-full border-none bg-transparent p-0 backdrop:bg-black/70"
    >
      <div
        className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[#3c3c3c] bg-[#252526] p-6 shadow-xl"
        role="presentation"
      >
        <h2 className="mb-2 text-lg font-semibold text-white">{title}</h2>
        <p className="mb-4 text-sm text-[#cccccc]">{description}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
        >
          <div className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm text-[#cccccc]"
              >
                패스워드
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                disabled={loading}
                className="w-full rounded border border-[#555] bg-[#3c3c3c] px-3 py-2 text-[#d4d4d4] outline-none transition-colors placeholder:text-[#888] focus:border-[#007acc] disabled:opacity-50"
                placeholder={mode === 'setup' ? '새 패스워드 입력' : '패스워드 입력'}
              />
            </div>

            {mode === 'setup' && (
              <div>
                <label
                  htmlFor="passwordConfirm"
                  className="mb-1 block text-sm text-[#cccccc]"
                >
                  패스워드 확인
                </label>
                <input
                  id="passwordConfirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full rounded border border-[#555] bg-[#3c3c3c] px-3 py-2 text-[#d4d4d4] outline-none transition-colors placeholder:text-[#888] focus:border-[#007acc] disabled:opacity-50"
                  placeholder="패스워드 다시 입력"
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-[#f48771]" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-[#007acc] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#005fa3] disabled:opacity-50"
            >
              {loading ? '처리 중...' : mode === 'setup' ? '설정 완료' : '잠금 해제'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}
