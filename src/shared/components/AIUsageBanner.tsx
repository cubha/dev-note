// src/shared/components/AIUsageBanner.tsx
//
// 공유 키 모드에서만 표시하는 잔여 횟수 배너
// BYOK 모드(userApiKey !== '')에서는 렌더하지 않음

import { useAtomValue, useSetAtom } from 'jotai'
import { aiUsageAtom, userApiKeyAtom, settingsOpenAtom, settingsInitialTabAtom } from '../../store/atoms'

export function AIUsageBanner() {
  const usage = useAtomValue(aiUsageAtom)
  const userApiKey = useAtomValue(userApiKeyAtom)
  const setSettingsOpen = useSetAtom(settingsOpenAtom)
  const setSettingsInitialTab = useSetAtom(settingsInitialTabAtom)

  if (userApiKey) return null
  if (usage.remaining === null) return null

  const pct = Math.round((usage.remaining / usage.limit) * 100)
  const isLow = usage.remaining <= Math.ceil(usage.limit * 0.2)

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface-hover)] px-3 py-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-[var(--bg-input)]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isLow ? 'bg-amber-500' : 'bg-[var(--accent)]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`shrink-0 tabular-nums ${isLow ? 'text-amber-400' : 'text-[var(--text-secondary)]'}`}>
          공유 키 · 오늘 {usage.remaining}회 남음
        </span>
      </div>
      <button
        type="button"
        onClick={() => { setSettingsInitialTab('ai'); setSettingsOpen(true) }}
        className="shrink-0 text-[var(--text-active)] hover:underline transition-colors"
      >
        내 키 사용 →
      </button>
    </div>
  )
}
