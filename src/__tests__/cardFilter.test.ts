import { describe, it, expect } from 'vitest'
import { filterAndSortItems } from '../core/cardFilter'
import type { Item } from '../core/db'

let nextId = 1
function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: nextId++, folderId: null, title: 'item', type: 'note', tags: [], order: 0,
    pinned: false, content: '{}', updatedAt: 0, createdAt: 0,
    ...overrides,
  }
}

function wrap(item: Item): { item: Item } {
  return { item }
}

const baseCriteria = {
  selectedFolder: null as number | null,
  typeFilter: null as Item['type'] | null,
  tagFilter: null as string | null,
  sortOrder: 'default' as const,
}

describe('filterAndSortItems — draft 제외', () => {
  it('draft:true인 아이템은 결과에서 제외된다', () => {
    const a = wrap(makeItem({ title: 'a', draft: true }))
    const b = wrap(makeItem({ title: 'b' }))
    const result = filterAndSortItems([a, b], baseCriteria)
    expect(result.map((r) => r.item.title)).toEqual(['b'])
  })

  it('draft:undefined(기존 카드)는 유지된다', () => {
    const a = wrap(makeItem({ title: 'a' }))
    const result = filterAndSortItems([a], baseCriteria)
    expect(result).toHaveLength(1)
  })
})

describe('filterAndSortItems — 필터', () => {
  it('selectedFolder로 필터링', () => {
    const a = wrap(makeItem({ folderId: 1 }))
    const b = wrap(makeItem({ folderId: 2 }))
    const result = filterAndSortItems([a, b], { ...baseCriteria, selectedFolder: 1 })
    expect(result).toHaveLength(1)
    expect(result[0].item.folderId).toBe(1)
  })

  it('typeFilter로 필터링', () => {
    const a = wrap(makeItem({ type: 'server' }))
    const b = wrap(makeItem({ type: 'note' }))
    const result = filterAndSortItems([a, b], { ...baseCriteria, typeFilter: 'server' })
    expect(result).toHaveLength(1)
    expect(result[0].item.type).toBe('server')
  })

  it('tagFilter로 필터링(태그 포함 여부)', () => {
    const a = wrap(makeItem({ tags: ['aws'] }))
    const b = wrap(makeItem({ tags: ['gcp'] }))
    const result = filterAndSortItems([a, b], { ...baseCriteria, tagFilter: 'aws' })
    expect(result).toHaveLength(1)
    expect(result[0].item.tags).toEqual(['aws'])
  })
})

describe('filterAndSortItems — 정렬', () => {
  it('pinned 항목이 항상 먼저 온다(sortOrder 무관)', () => {
    const a = wrap(makeItem({ title: 'a', pinned: false, updatedAt: 100 }))
    const b = wrap(makeItem({ title: 'b', pinned: true, updatedAt: 1 }))
    const result = filterAndSortItems([a, b], { ...baseCriteria, sortOrder: 'updatedAt' })
    expect(result[0].item.title).toBe('b')
  })

  it('updatedAt 정렬은 내림차순(최신 먼저)', () => {
    const a = wrap(makeItem({ title: 'old', updatedAt: 1 }))
    const b = wrap(makeItem({ title: 'new', updatedAt: 100 }))
    const result = filterAndSortItems([a, b], { ...baseCriteria, sortOrder: 'updatedAt' })
    expect(result.map((r) => r.item.title)).toEqual(['new', 'old'])
  })

  it('default 정렬은 order 오름차순', () => {
    const a = wrap(makeItem({ title: 'second', order: 2 }))
    const b = wrap(makeItem({ title: 'first', order: 1 }))
    const result = filterAndSortItems([a, b], baseCriteria)
    expect(result.map((r) => r.item.title)).toEqual(['first', 'second'])
  })

  it('title 정렬은 오름차순', () => {
    const a = wrap(makeItem({ title: 'banana' }))
    const b = wrap(makeItem({ title: 'apple' }))
    const result = filterAndSortItems([a, b], { ...baseCriteria, sortOrder: 'title' })
    expect(result.map((r) => r.item.title)).toEqual(['apple', 'banana'])
  })
})
