// src/features/settings/AISettingsTab.tsx
//
// 환경설정 AI 탭
// - BYOK 전용 (서버 보관 키 없음): Provider 드롭다운 + API Key 입력/저장/지우기

import { useState } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { ExternalLink } from 'lucide-react'
import { db } from '../../core/db'
import type { AIProvider } from '../../core/db'
import {
  selectedProviderAtom,
  userApiKeyAtom,
  appConfigAtom,
} from '../../store/atoms'

const PROVIDER_LABELS: Record<AIProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  openai: 'OpenAI (GPT-4o)',
}

export function AISettingsTab() {
  const [selectedProvider, setSelectedProvider] = useAtom(selectedProviderAtom)
  const [userApiKey, setUserApiKey] = useAtom(userApiKeyAtom)
  const setConfig = useSetAtom(appConfigAtom)

  const [keyInput, setKeyInput] = useState(userApiKey)
  const [saved, setSaved] = useState(false)

  const handleProviderChange = async (p: AIProvider) => {
    setSelectedProvider(p)
    setConfig((prev) => prev ? { ...prev, selectedProvider: p } : prev)
    await db.config.update(1, { selectedProvider: p })
  }

  // 키는 Jotai atom(세션 메모리)에만 둔다 — db.config에 쓰면 IndexedDB에 평문으로 남고,
  // at-rest 암호화는 config 테이블을 덮지 않아 암호화를 켜도 노출된다(CLAUDE.md 하드룰 위반).
  const handleSave = () => {
    setUserApiKey(keyInput.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClear = () => {
    setKeyInput('')
    setUserApiKey('')
  }

  return (
    <div className="space-y-6">

      {/* ── 내 API 키 사용 ── */}
      <section>
        <h3 className="section-label">내 API 키</h3>
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
              onClick={handleSave}
              disabled={!keyInput.trim()}
              className="btn-primary shrink-0"
            >
              {saved ? '적용됨' : '적용'}
            </button>
          </div>

          {/* 지우기 버튼 */}
          {userApiKey && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
            >
              지우기
            </button>
          )}

          <p className="text-xs text-[var(--text-tertiary)]">
            AI 기능(Smart Paste·요약)은 본인 API 키로만 동작합니다. 사용량은 입력한 키의 quota에서 차감됩니다.
          </p>

          <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-hover)] px-3 py-2">
            <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
              🔑 API 키는 <span className="font-medium text-[var(--text-primary)]">이 세션에만</span> 보관됩니다.
              브라우저를 닫거나 새로고침하면 지워지므로, 사용할 때마다 다시 입력해야 합니다.
              키를 저장해 두지 않는 이유는 브라우저 저장소(IndexedDB)에 남으면 기기에 접근할 수 있는 사람이 그대로 읽을 수 있기 때문입니다.
            </p>
          </div>
        </div>
      </section>

    </div>
  )
}
