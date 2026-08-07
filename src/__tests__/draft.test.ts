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
  const dummyKey = {} as CryptoKey

  it('평문 content면 키 유무와 무관하게 true', () => {
    expect(isDraftPersistable({ content: '{"format":"structured","fields":[]}' }, null)).toBe(true)
    expect(isDraftPersistable({ content: '{"format":"structured","fields":[]}' }, dummyKey)).toBe(true)
  })

  it('암호화된 content인데 키가 없으면(잠김) false', () => {
    expect(isDraftPersistable({ content: '{"enc":1,"ct":"abc"}' }, null)).toBe(false)
  })

  it('암호화된 content라도 키가 있으면(잠금 해제) true', () => {
    expect(isDraftPersistable({ content: '{"enc":1,"ct":"abc"}' }, dummyKey)).toBe(true)
  })

  it('빈 content면 true', () => {
    expect(isDraftPersistable({ content: '' }, null)).toBe(true)
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

  it('document 섹션 요소가 id/type이 없는 객체면 null', () => {
    expect(parseDraftBody('{"kind":"document","sections":[{"foo":"bar"}]}')).toBeNull()
  })

  it('document 섹션 type이 알려진 SectionType이 아니면 null', () => {
    expect(
      parseDraftBody('{"kind":"document","sections":[{"id":"s1","type":"unknown","title":"","collapsed":false}]}'),
    ).toBeNull()
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
