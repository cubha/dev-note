// src/features/settings/AISettingsTab.tsx
//
// 환경설정 AI 탭
// - 공유 키 모드: 잔여 횟수 + 진행 바 표시
// - BYOK: Provider 드롭다운 + API Key 입력/저장/지우기

import { useState } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { ExternalLink } from 'lucide-react'
import { db } from '../../core/db'
import type { AIProvider } from '../../core/db'
import {
  aiUsageAtom,
  selectedProviderAtom,
  userApiKeyAtom,
  appConfigAtom,
} from '../../store/atoms'

const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  openai: 'OpenAI (GPT-4o)',
}

function formatResetAt(resetAt: string | null): string {
  if (!resetAt) return '매일 00:00 UTC'
  try {
    const d = new Date(resetAt)
    const now = new Date()
    const isToday = d.getUTCDate() === now.getUTCDate() + 1 || d.getTime() - now.getTime() < 86400_000
    return isToday ? '내일 00:00 UTC 초기화' : '00:00 UTC 초기화'
  } catch {
    return '00:00 UTC 초기화'
  }
}

export function AISettingsTab() {
  const usage = useAtomValue(aiUsageAtom)
  const [selectedProvider, setSelectedProvider] = useAtom(selectedProviderAtom)
  const [userApiKey, setUserApiKey] = useAtom(userApiKeyAtom)
  const setConfig = useSetAtom(appConfigAtom)

  const [keyInput, setKeyInput] = useState(userApiKey)
  const [saved, setSaved] = useState(false)

  const isSharedMode = !userApiKey

  const handleProviderChange = async (p: AIProvider) => {
    setSelectedProvider(p)
    setConfig((prev) => prev ? { ...prev, selectedProvider: p } : prev)
    await db.config.update(1, { selectedProvider: p })
  }

  const handleSave = async () => {
    const trimmed = keyInput.trim()
    setUserApiKey(trimmed)
    setConfig((prev) => prev ? { ...prev, userApiKey: trimmed } : prev)
    await db.config.update(1, { userApiKey: trimmed })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = async () => {
    setKeyInput('')
    setUserApiKey('')
    setConfig((prev) => prev ? { ...prev, userApiKey: '' } : prev)
    await db.config.update(1, { userApiKey: '' })
  }

  const remaining = usage.remaining
  const limit = usage.limit
  const progressPct = remaining !== null ? Math.round((remaining / limit) * 100) : 0

  return (
    <div className="space-y-6">

      {/* ── 공유 키 모드 현황 ── */}
      {isSharedMode && (
        <section>
          <h3 className="section-label">기본 모드 (공유 키)</h3>
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-hover)] p-4 space-y-3">
            <p className="text-sm text-[var(--text-primary)]">공유 키 사용 중</p>

            {remaining !== null ? (
              <>
                <p className="text-xs text-[var(--text-secondary)]">
                  오늘 <span className="font-semibold text-[var(--text-primary)]">{remaining}회</span> 남음
                  {' · '}{formatResetAt(usage.resetAt)}
                </p>
                <div className="space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--bg-input)]">
                    <div
                      className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-right text-xs tabular-nums text-[var(--text-tertiary)]">
                    {remaining} / {limit}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-[var(--text-secondary)]">
                AI 기능을 한 번 사용하면 잔여 횟수가 표시됩니다.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── 내 API 키 사용 ── */}
      <section>
        <h3 className="section-label">내 API 키 사용 (선택)</h3>
        <div className="space-y-4">

          {/* Provider 드롭다운 */}
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm text-[var(--text-primary)]">AI Provider</span>
            <select
              value={selectedProvider}
              onChange={(e) => void handleProviderChange(e.target.value as AIProvider)}
              className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--border-accent)]"
            >
              {(Object.keys(PROVIDER_LABELS) as AIProvider[]).map((p) => (
                <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
              ))}
            </select>
          </div>

          {/* Provider별 키 발급 링크 */}
          {selectedProvider === 'anthropic' && (
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--text-active)] hover:underline"
            >
              <ExternalLink className="size-3" />
              API 키 발급 → console.anthropic.com
            </a>
          )}
          {selectedProvider === 'google' && (
            <a
              href="https://aistudio.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--text-active)] hover:underline"
            >
              <ExternalLink className="size-3" />
              무료 API 키 발급 → aistudio.google.com
            </a>
          )}
          {selectedProvider === 'openai' && (
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-[var(--text-active)] hover:underline"
            >
              <ExternalLink className="size-3" />
              API 키 발급 → platform.openai.com
            </a>
          )}

          {/* API Key 입력 */}
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm text-[var(--text-primary)]">API Key</span>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={
                selectedProvider === 'anthropic' ? 'sk-ant-api03-...'
                : selectedProvider === 'google' ? 'AIza...'
                : 'sk-...'
              }
              className="flex-1 rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-placeholder)] focus:outline-none focus:ring-1 focus:ring-[var(--border-accent)]"
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!keyInput.trim()}
              className="shrink-0 rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40 hover:opacity-90"
            >
              {saved ? '저장됨' : '저장'}
            </button>
          </div>

          {/* 지우기 버튼 */}
          {userApiKey && (
            <button
              type="button"
              onClick={() => void handleClear()}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              지우기 — 공유 키로 복귀
            </button>
          )}

          <p className="text-xs text-[var(--text-tertiary)]">
            키 입력 시 일일 제한 없이 본인 quota를 사용합니다.
          </p>
        </div>
      </section>

    </div>
  )
}
