// src/features/settings/KeybindingsTab.tsx
//
// 단축키 설정 탭
// 카테고리별 그룹 표시, 녹화 모드, 유효성 검사, 초기화

import { useState, useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  DEFAULT_KEYBINDINGS,
  validateKeybinding,
  suggestAlternatives,
  type CommandId,
} from '../../core/keybindings'
import { formatForDisplay } from '@tanstack/hotkeys'
import {
  keybindingOverridesWriteAtom,
  effectiveKeybindingsAtom,
} from '../../store/atoms'
import { useHotkeyRecorder } from '../../shared/hooks/useHotkeyRecorder'

// ─── 카테고리 정의 ─────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  card: '카드',
  folder: '폴더',
  tab: '탭',
  search: '검색',
  ui: 'UI',
  editor: '에디터',
}

const CATEGORY_ORDER = ['card', 'folder', 'tab', 'search', 'ui', 'editor']

const groupByCategory = (): [string, CommandId[]][] => {
  const map = new Map<string, CommandId[]>()
  for (const [id, def] of Object.entries(DEFAULT_KEYBINDINGS) as [CommandId, (typeof DEFAULT_KEYBINDINGS)[CommandId]][]) {
    const cat = def.category
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(id)
  }
  return CATEGORY_ORDER
    .filter((cat) => map.has(cat))
    .map((cat) => [cat, map.get(cat)!])
}

// ─── 단일 행 컴포넌트 ──────────────────────────────────────────

interface RowError {
  kind: 'blocked' | 'conflict'
  message: string
  alternatives: string[]
}

interface KeybindingRowProps {
  commandId: CommandId
  currentKey: string
  isDefault: boolean
  onSave: (commandId: CommandId, key: string) => void
  onReset: (commandId: CommandId) => void
  effectiveBindings: Record<CommandId, string>
}

const KeybindingRow = ({
  commandId,
  currentKey,
  isDefault,
  onSave,
  onReset,
  effectiveBindings,
}: KeybindingRowProps) => {
  const { recording, recordedKey, startRecording } = useHotkeyRecorder()
  const [rowError, setRowError] = useState<RowError | null>(null)
  const [warnMessage, setWarnMessage] = useState<string | null>(null)
  const prevRecordedKey = useRef<string | null>(null)

  const def = DEFAULT_KEYBINDINGS[commandId]

  // 녹화 완료 감지
  useEffect(() => {
    if (!recordedKey || recordedKey === prevRecordedKey.current) return
    prevRecordedKey.current = recordedKey

    setRowError(null)
    setWarnMessage(null)
    const result = validateKeybinding(recordedKey, commandId, effectiveBindings)

    if (result.status === 'blocked') {
      setRowError({
        kind: 'blocked',
        message: result.message,
        alternatives: suggestAlternatives(recordedKey, effectiveBindings),
      })
    } else if (result.status === 'conflict') {
      setRowError({
        kind: 'conflict',
        message: result.message,
        alternatives: suggestAlternatives(recordedKey, effectiveBindings),
      })
    } else if (result.status === 'warn') {
      setWarnMessage(result.message)
      onSave(commandId, recordedKey)
    } else {
      onSave(commandId, recordedKey)
    }
  }, [recordedKey, commandId, effectiveBindings, onSave])

  const handleReset = () => {
    setRowError(null)
    setWarnMessage(null)
    onReset(commandId)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {/* 라벨 */}
        <span className="w-32 shrink-0 text-sm text-[var(--text-primary)]">
          {def.label}
        </span>

        {/* 바인딩 버튼 */}
        <button
          type="button"
          onClick={startRecording}
          className={`flex h-7 min-w-[120px] items-center justify-center rounded border px-2 text-xs font-mono transition-colors ${
            recording
              ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] animate-pulse'
              : rowError
              ? 'border-red-500/50 bg-red-500/10 text-[var(--text-primary)]'
              : warnMessage
              ? 'border-yellow-500/50 bg-yellow-500/10 text-[var(--text-primary)]'
              : 'border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-primary)] hover:bg-[var(--bg-input-hover)]'
          }`}
        >
          {recording ? '키를 입력하세요...' : formatForDisplay(currentKey)}
        </button>

        {/* 초기화 버튼 */}
        {!isDefault && (
          <button
            type="button"
            onClick={handleReset}
            title="기본값으로 초기화"
            className="flex items-center justify-center rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
          >
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}
      </div>

      {/* 에러 메시지 + 대안 칩 */}
      {rowError && (
        <div className="ml-[8.5rem] space-y-1">
          <p className="text-[11px] text-red-400">{rowError.message}</p>
          {rowError.alternatives.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {rowError.alternatives.map((alt) => (
                <button
                  key={alt}
                  type="button"
                  onClick={() => {
                    setRowError(null)
                    onSave(commandId, alt)
                  }}
                  className="rounded border border-[var(--border-default)] bg-[var(--bg-input)] px-2 py-0.5 text-[11px] font-mono text-[var(--text-primary)] hover:bg-[var(--bg-input-hover)]"
                >
                  {formatForDisplay(alt)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 경고 메시지 */}
      {warnMessage && !rowError && (
        <p className="ml-[8.5rem] text-[11px] text-yellow-400">{warnMessage}</p>
      )}
    </div>
  )
}

// ─── KeybindingsTab ────────────────────────────────────────────

export const KeybindingsTab = () => {
  const effectiveBindings = useAtomValue(effectiveKeybindingsAtom)
  const setOverrides = useSetAtom(keybindingOverridesWriteAtom)
  const [overrides, setLocalOverrides] = useState<Record<string, { userKey: string | null; enabled: boolean }>>(() => {
    try {
      const raw = localStorage.getItem('dev-note:keybindings')
      return raw ? (JSON.parse(raw) as Record<string, { userKey: string | null; enabled: boolean }>) : {}
    } catch {
      return {}
    }
  })

  const grouped = groupByCategory()

  const handleSave = (commandId: CommandId, key: string) => {
    const next = {
      ...overrides,
      [commandId]: { userKey: key, enabled: true },
    }
    setLocalOverrides(next)
    setOverrides(next)
  }

  const handleReset = (commandId: CommandId) => {
    const next = { ...overrides }
    delete next[commandId]
    setLocalOverrides(next)
    setOverrides(next)
  }

  const handleResetAll = () => {
    setLocalOverrides({})
    setOverrides({})
  }

  return (
    <div className="space-y-6">
      {grouped.map(([category, commands]) => (
        <section key={category}>
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-secondary)]">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="space-y-3">
            {commands.map((commandId) => {
              const currentKey = effectiveBindings[commandId] ?? DEFAULT_KEYBINDINGS[commandId].defaultKey
              const isDefault = !(commandId in overrides)
              return (
                <KeybindingRow
                  key={commandId}
                  commandId={commandId}
                  currentKey={currentKey}
                  isDefault={isDefault}
                  onSave={handleSave}
                  onReset={handleReset}
                  effectiveBindings={effectiveBindings}
                />
              )
            })}
          </div>
        </section>
      ))}

      {/* 모두 초기화 */}
      <div className="border-t border-[var(--border-default)] pt-4">
        <button
          type="button"
          onClick={handleResetAll}
          className="text-xs text-[var(--text-secondary)] hover:text-red-400 transition-colors"
        >
          모두 초기화
        </button>
      </div>
    </div>
  )
}
