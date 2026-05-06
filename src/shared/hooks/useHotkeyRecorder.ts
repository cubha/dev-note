// src/shared/hooks/useHotkeyRecorder.ts
//
// 키바인딩 녹화 훅 — 사용자가 키를 입력하면 정규화된 키 문자열을 반환

import { useState, useCallback, useEffect } from 'react'

export interface HotkeyRecorderState {
  recording: boolean
  recordedKey: string | null
  startRecording: () => void
  stopRecording: () => void
}

/** KeyboardEvent → "Mod+Alt+K" 형태 정규화 */
const normalizeKey = (e: KeyboardEvent): string | null => {
  const IGNORE_KEYS = new Set([
    'Control', 'Meta', 'Alt', 'Shift',
    'CapsLock', 'Tab', 'Unidentified',
  ])
  if (IGNORE_KEYS.has(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Mod')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key)

  return parts.join('+')
}

export const useHotkeyRecorder = (): HotkeyRecorderState => {
  const [recording, setRecording] = useState(false)
  const [recordedKey, setRecordedKey] = useState<string | null>(null)

  const stopRecording = useCallback(() => {
    setRecording(false)
  }, [])

  const startRecording = useCallback(() => {
    setRecordedKey(null)
    setRecording(true)
  }, [])

  useEffect(() => {
    if (!recording) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(false)
        return
      }
      const key = normalizeKey(e)
      if (key) {
        setRecordedKey(key)
        setRecording(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [recording])

  return { recording, recordedKey, startRecording, stopRecording }
}
