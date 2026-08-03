import { describe, it, expect } from 'vitest'
import {
  isDraftPersistable,
  serializeDraftBody,
  parseDraftBody,
  orphanDraftIds,
  filterRestorableTabs,
  mergeDraftTabs,
} from '../core/draft'
import type { DraftBody } from '../core/draft'

describe('isDraftPersistable', () => {
  it('평문 content면 true', () => {
    expect(isDraftPersistable({ content: '{"format":"structured","fields":[]}' })).toBe(true)
  })

  it('암호화된 content면 false', () => {
    expect(isDraftPersistable({ content: '{"enc":1,"ct":"abc"}' })).toBe(false)
  })

  it('빈 content면 true', () => {
    expect(isDraftPersistable({ content: '' })).toBe(true)
  })
})

describe('serializeDraftBody / parseDraftBody', () => {
  it('fields 바디 왕복', () => {
    const body: DraftBody = { kind: 'fields', fields: [['host', '10.0.0.1'], ['port', '22']], editorText: '메모' }
    const text = serializeDraftBody(body)
    expect(parseDraftBody(text)).toEqual(body)
  })

  it('document 바디 왕복', () => {
    const body: DraftBody = {
      kind: 'document',
      sections: [{ id: 's1', type: 'markdown', title: '메모', collapsed: false, text: 'hello' }],
    }
    const text = serializeDraftBody(body)
    expect(parseDraftBody(text)).toEqual(body)
  })

  it('손상된 JSON은 null', () => {
    expect(parseDraftBody('{not json')).toBeNull()
  })

  it('kind 필드가 없는 객체는 null', () => {
    expect(parseDraftBody('{"foo":"bar"}')).toBeNull()
  })

  it('fields 배열 요소가 [string,string] 쌍이 아니면 null', () => {
    expect(parseDraftBody('{"kind":"fields","fields":[["host"]],"editorText":""}')).toBeNull()
  })
})

describe('orphanDraftIds', () => {
  it('현존 아이템에 없는 드래프트 id만 반환', () => {
    expect(orphanDraftIds([1, 2, 3], new Set([2]))).toEqual([1, 3])
  })

  it('전부 현존하면 빈 배열', () => {
    expect(orphanDraftIds([1, 2], new Set([1, 2]))).toEqual([])
  })
})

describe('filterRestorableTabs', () => {
  it('삭제된 아이템의 탭 id는 제외', () => {
    expect(filterRestorableTabs([1, 2, 3], new Set([1, 3]))).toEqual([1, 3])
  })

  it('순서를 보존한다', () => {
    expect(filterRestorableTabs([3, 1, 2], new Set([1, 2, 3]))).toEqual([3, 1, 2])
  })
})

describe('mergeDraftTabs', () => {
  it('복원 목록에 없는 드래프트 탭을 뒤에 추가', () => {
    expect(mergeDraftTabs([1, 2], [2, 3])).toEqual([1, 2, 3])
  })

  it('중복 없이 순서를 보존한다', () => {
    expect(mergeDraftTabs([5], [5, 6])).toEqual([5, 6])
  })

  it('드래프트가 없으면 복원 목록 그대로', () => {
    expect(mergeDraftTabs([1, 2], [])).toEqual([1, 2])
  })
})
