import { DEFAULT_ITEM_TITLE } from '../shared/constants'

/**
 * 이미 등재된 제목 집합(taken)과 충돌하지 않는 제목을 만든다.
 * 빈 제목은 DEFAULT_ITEM_TITLE로 대체한 뒤 동일한 넘버링 규칙을 적용한다.
 */
export const uniquifyTitle = (title: string, taken: Set<string>): string => {
  const base = title.trim() === '' ? DEFAULT_ITEM_TITLE : title
  if (!taken.has(base)) return base

  let n = 1
  while (taken.has(`${base} (${n})`)) n++
  return `${base} (${n})`
}

// eslint-disable-next-line no-control-regex -- 파일명 예약 제어문자(0x00-0x1f, 0x80-0x9f) 제거는 의도된 것
const RESERVED_CHARS = /[/\\:*?"<>|\x00-\x1f\x80-\x9f]/g
const WINDOWS_RESERVED = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

/** 파일명으로 안전한 문자열로 변환한다. 결과가 비거나 Windows 예약어면 안전하게 치환한다. */
export const sanitizeFilename = (name: string): string => {
  let result = name.replace(RESERVED_CHARS, '').trim().replace(/[.\s]+$/, '')
  if (result === '') return DEFAULT_ITEM_TITLE
  if (WINDOWS_RESERVED.has(result.toUpperCase())) result = `_${result}`
  return result
}
