import { describe, it, expect } from 'vitest'
import { computeDirtyTargets } from '../store/tabHelpers'

describe('computeDirtyTargets — single', () => {
  it('대상 탭이 dirty면 자신을 반환', () => {
    expect(computeDirtyTargets('single', 2, [1, 2, 3], new Set([2]))).toEqual([2])
  })

  it('대상 탭이 clean이면 빈 배열', () => {
    expect(computeDirtyTargets('single', 2, [1, 2, 3], new Set([1]))).toEqual([])
  })

  it('tabId가 null이면 빈 배열', () => {
    expect(computeDirtyTargets('single', null, [1, 2, 3], new Set([1]))).toEqual([])
  })
})

describe('computeDirtyTargets — others', () => {
  it('자신을 제외한 dirty 탭만 반환', () => {
    expect(computeDirtyTargets('others', 2, [1, 2, 3], new Set([1, 2, 3]))).toEqual([1, 3])
  })

  it('닫히는 탭 중 dirty가 없으면 빈 배열', () => {
    expect(computeDirtyTargets('others', 2, [1, 2, 3], new Set([2]))).toEqual([])
  })
})

describe('computeDirtyTargets — right / left', () => {
  it('right: 지정 탭 오른쪽 중 dirty만', () => {
    expect(computeDirtyTargets('right', 2, [1, 2, 3, 4], new Set([3, 4]))).toEqual([3, 4])
  })

  it('right: 존재하지 않는 tabId면 빈 배열', () => {
    expect(computeDirtyTargets('right', 99, [1, 2, 3], new Set([1, 2, 3]))).toEqual([])
  })

  it('left: 지정 탭 왼쪽 중 dirty만', () => {
    expect(computeDirtyTargets('left', 3, [1, 2, 3, 4], new Set([1, 4]))).toEqual([1])
  })
})

describe('computeDirtyTargets — all', () => {
  it('열린 탭 전체 중 dirty만', () => {
    expect(computeDirtyTargets('all', null, [1, 2, 3], new Set([1, 3]))).toEqual([1, 3])
  })

  it('dirty가 없으면 빈 배열', () => {
    expect(computeDirtyTargets('all', null, [1, 2, 3], new Set())).toEqual([])
  })
})
