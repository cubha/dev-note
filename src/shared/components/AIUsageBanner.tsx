// src/shared/components/AIUsageBanner.tsx
//
// API 키 미입력 안내 배너 (BYOK 전용 — 서버 보관 키 없음)
// 키가 입력돼 있으면 렌더하지 않음

import { useAtomValue, useSetAtom } from 'jotai'
import { userApiKeyAtom, settingsOpenAtom, settingsInitialTabAtom } from '../../store/atoms'

export function AIUsageBanner() {
  const userApiKey = useAtomValue(userApiKeyAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setSettingsInitialTab = useSetAtom(settingsInitialTabAtom)

  if (userApiKey) return null

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-hover)] px-3 py-2 text-xs">
      <span className="min-w-0 text-[var(--text-secondary)]">
        AI 기능은 본인 API 키가 필요합니다
      </span>
      <button
        type="button"
        onClick={() => { setSettingsInitialTab('ai'); setSettingsOpen(true) }}
        className="shrink-0 text-[var(--text-active)] hover:underline transition-colors"
      >
        API 키 입력 →
      </button>
    </div>
  )
}
