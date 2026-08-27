import { describe, it, expect } from 'vitest'
import { uniquifyTitle, sanitizeFilename } from '../core/naming'

describe('uniquifyTitle', () => {
  it('충돌 없으면 원본 제목 그대로', () => {
    expect(uniquifyTitle('서버 A', new Set(['다른 제목']))).toBe('서버 A')
  })

  it('빈 제목은 기본값(제목없음)으로 치환', () => {
    expect(uniquifyTitle('', new Set())).toBe('제목없음')
  })

  it('충돌하면 (1)을 붙인다', () => {
    expect(uniquifyTitle('서버 A', new Set(['서버 A']))).toBe('서버 A (1)')
  })

  it('(1)도 충돌하면 (2)로 올라간다', () => {
    expect(uniquifyTitle('서버 A', new Set(['서버 A', '서버 A (1)']))).toBe('서버 A (2)')
  })

  it('빈 제목이 이미 여러 개 있으면 넘버링된다', () => {
    const taken = new Set(['제목없음', '제목없음 (1)'])
    expect(uniquifyTitle('', taken)).toBe('제목없음 (2)')
  })

  it('공백만 있는 제목도 빈 제목으로 취급', () => {
    expect(uniquifyTitle('   ', new Set())).toBe('제목없음')
  })
})

describe('sanitizeFilename', () => {
  it('예약 문자를 치환한다', () => {
    expect(sanitizeFilename('서버/운영:1*2?"<3>4|5')).not.toMatch(/[/\\:*?"<>|]/)
  })

  it('일반 제목은 그대로 유지', () => {
    expect(sanitizeFilename('운영 서버 접속정보')).toBe('운영 서버 접속정보')
  })

  it('빈 문자열이면 기본값으로 대체', () => {
    expect(sanitizeFilename('')).toBe('제목없음')
  })

  it('예약문자만 있어 결과가 비면 기본값으로 대체', () => {
    expect(sanitizeFilename('///')).toBe('제목없음')
  })

  it('앞뒤 공백·마침표를 제거한다', () => {
    expect(sanitizeFilename('  제목.  ')).toBe('제목')
  })

  it('Windows 예약어는 안전하게 변형된다', () => {
    const result = sanitizeFilename('CON')
    expect(result).not.toBe('CON')
    expect(result.toUpperCase()).not.toBe('CON')
  })

  it('Windows 예약어는 대소문자 무관하게 감지된다', () => {
    const result = sanitizeFilename('con')
    expect(result.toUpperCase()).not.toBe('CON')
  })

  it('제어 문자를 제거한다', () => {
    expect(sanitizeFilename('제목\x00\x1f끝')).toBe('제목끝')
  })
})
