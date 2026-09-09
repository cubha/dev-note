import { describe, it, expect } from 'vitest'
import {
  DEFAULT_KEYBINDINGS,
  BROWSER_WARN,
  validateKeybinding,
  suggestAlternatives,
  getEffectiveBindings,
} from '../core/keybindings'

// ── editor.find / editor.replace 등록 ───────────────────────────

describe('editor.find / editor.replace 기본 등록', () => {
  it('DEFAULT_KEYBINDINGS에 editor.find(Mod+F)·editor.replace(Mod+H)가 editor 카테고리로 존재한다', () => {
    expect(DEFAULT_KEYBINDINGS['editor.find']).toEqual({
      label: '에디터에서 찾기',
      defaultKey: 'Mod+F',
      category: 'editor',
    })
    expect(DEFAULT_KEYBINDINGS['editor.replace']).toEqual({
      label: '에디터에서 바꾸기',
      defaultKey: 'Mod+H',
      category: 'editor',
    })
  })

  it('Mod+H가 BROWSER_WARN에 포함된다', () => {
    expect(BROWSER_WARN.has('Mod+H')).toBe(true)
  })

  it('getEffectiveBindings({})에 editor.find=Mod+F, editor.replace=Mod+H가 포함된다', () => {
    const result = getEffectiveBindings({})
    expect(result['editor.find']).toBe('Mod+F')
    expect(result['editor.replace']).toBe('Mod+H')
  })

  it('editor.find를 enabled:false로 끄면 결과에서 빠진다', () => {
    const result = getEffectiveBindings({
      'editor.find': { userKey: null, enabled: false },
    })
    expect('editor.find' in result).toBe(false)
    expect(result['editor.replace']).toBe('Mod+H')
  })
})

// ── validateKeybinding 우선순위: blocked → conflict → warn ──────

describe('validateKeybinding 우선순위 (blocked → conflict → warn)', () => {
  const defaultBindings = Object.fromEntries(
    Object.entries(DEFAULT_KEYBINDINGS).map(([id, def]) => [id, def.defaultKey]),
  )

  it('Mod+F를 다른 커맨드(card.new)에 재할당 시도하면 conflict를 반환한다 (warn 아님)', () => {
    const result = validateKeybinding('Mod+F', 'card.new', defaultBindings)
    expect(result.status).toBe('conflict')
    expect((result as { conflictId: string }).conflictId).toBe('editor.find')
  })

  it('Mod+H를 다른 커맨드(card.new)에 재할당 시도하면 conflict를 반환한다', () => {
    const result = validateKeybinding('Mod+H', 'card.new', defaultBindings)
    expect(result.status).toBe('conflict')
    expect((result as { conflictId: string }).conflictId).toBe('editor.replace')
  })

  it('Mod+T(reserved)는 blocked를 반환한다 (최우선)', () => {
    const result = validateKeybinding('Mod+T', 'card.new', defaultBindings)
    expect(result.status).toBe('blocked')
  })

  it('Mod+P(WARN이며 아무도 안 씀)는 warn을 반환한다', () => {
    const result = validateKeybinding('Mod+P', 'card.new', defaultBindings)
    expect(result.status).toBe('warn')
  })

  it('자기 자신에게 같은 키를 재할당하면 ok를 반환한다 (WARN·RESERVED 미포함 키로 검증)', () => {
    // editor.find/editor.replace의 기본키(Mod+F/Mod+H)는 BROWSER_WARN 대상이라
    // 자기 자신 재할당이어도 warn이 정상 발화한다(기존 동작, 회귀 아님) — 그래서
    // WARN/RESERVED 어디에도 없는 card.new(Mod+Alt+N)로 conflict 제외 로직만 분리 검증한다.
    const result = validateKeybinding('Mod+Alt+N', 'card.new', defaultBindings)
    expect(result.status).toBe('ok')
  })
})

// ── suggestAlternatives ─────────────────────────────────────────

describe('suggestAlternatives', () => {
  it('Mod+F에 대해 reserved·사용중 키를 제외한 대안을 최대 3개 반환한다', () => {
    const defaultBindings = Object.fromEntries(
      Object.entries(DEFAULT_KEYBINDINGS).map(([id, def]) => [id, def.defaultKey]),
    )
    const result = suggestAlternatives('Mod+F', defaultBindings)
    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThanOrEqual(3)
    for (const candidate of result) {
      expect(Object.values(defaultBindings)).not.toContain(candidate)
    }
  })
})
