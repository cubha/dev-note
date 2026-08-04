import { describe, it, expect, beforeEach } from 'vitest'
import { loadSessionSnapshot, saveSessionSnapshot, SESSION_STORAGE_KEY } from '../store/sessionPersist'

// vitest 기본 환경이 'node'라 localStorage가 없다 — 이 파일 전용 최소 인메모리 폴리필
// (jsdom 전환은 다른 전체 테스트의 환경/성능에 영향을 주므로 이 모듈만 국소적으로 처리)
class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() { return this.store.size }
  clear() { this.store.clear() }
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null }
  removeItem(key: string) { this.store.delete(key) }
  setItem(key: string, value: string) { this.store.set(key, value) }
}

globalThis.localStorage = new MemoryStorage()

describe('sessionPersist', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('저장 후 읽으면 왕복된다', () => {
    saveSessionSnapshot({ openTabs: [1, 2, 3], activeTab: 2 })
    expect(loadSessionSnapshot()).toEqual({ openTabs: [1, 2, 3], activeTab: 2 })
  })

  it('activeTab이 null이어도 왕복된다', () => {
    saveSessionSnapshot({ openTabs: [], activeTab: null })
    expect(loadSessionSnapshot()).toEqual({ openTabs: [], activeTab: null })
  })

  it('저장된 값이 없으면 null', () => {
    expect(loadSessionSnapshot()).toBeNull()
  })

  it('손상된 JSON이면 null', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{not json')
    expect(loadSessionSnapshot()).toBeNull()
  })

  it('openTabs가 배열이 아니면 null', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ openTabs: 'x', activeTab: null }))
    expect(loadSessionSnapshot()).toBeNull()
  })

  it('openTabs 요소가 숫자가 아니면 null', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ openTabs: [1, 'x'], activeTab: null }))
    expect(loadSessionSnapshot()).toBeNull()
  })

  it('activeTab이 숫자·null이 아니면 null', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ openTabs: [1], activeTab: 'x' }))
    expect(loadSessionSnapshot()).toBeNull()
  })
})
