import { describe, it, expect } from 'vitest'
import { computeSyncPlan } from '../features/sync/syncEngine'
import type { LocalNoteState } from '../features/sync/syncEngine'
import { emptyManifest } from '../features/sync/sync-schema'
import type { SyncManifest } from '../features/sync/sync-schema'

// manifest 빌더 헬퍼
function manifest(
  notes: Record<string, { version: string; updatedAt?: number }>,
  tombstones: Record<string, number> = {},
): SyncManifest {
  const m = emptyManifest(0)
  for (const [uuid, n] of Object.entries(notes)) {
    m.notes[uuid] = { version: n.version, updatedAt: n.updatedAt ?? 0 }
  }
  for (const [uuid, deletedAt] of Object.entries(tombstones)) {
    m.tombstones[uuid] = { deletedAt }
  }
  return m
}

function local(partial: Partial<LocalNoteState> & { uuid: string }): LocalNoteState {
  return { version: 'v', updatedAt: 100, ...partial }
}

describe('computeSyncPlan — 기본 전송', () => {
  it('로컬 신규(미동기화) + 원격 없음 → toPush', () => {
    const plan = computeSyncPlan([local({ uuid: 'a', version: 'L1' })], emptyManifest(0))
    expect(plan.toPush).toEqual(['a'])
  })

  it('로컬 변경(L≠base) + 원격 base 유지 → toPush', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'L2', syncedVersion: 'L1' })],
      manifest({ a: { version: 'L1' } }),
    )
    expect(plan.toPush).toEqual(['a'])
  })

  it('로컬 불변(L=base) + 원격 변경(R≠base) → toPull', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'L1', syncedVersion: 'L1' })],
      manifest({ a: { version: 'R2' } }),
    )
    expect(plan.toPull).toEqual(['a'])
  })

  it('원격에만 존재(다른 기기 신규) → toPull', () => {
    const plan = computeSyncPlan([], manifest({ a: { version: 'R1' } }))
    expect(plan.toPull).toEqual(['a'])
  })

  it('완전 동기 상태(L=base=R) → 아무 전송 없음', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'L1', syncedVersion: 'L1' })],
      manifest({ a: { version: 'L1' } }),
    )
    expect(plan).toEqual({ toPush: [], toPull: [], conflicts: [], toTombstone: [], toDeleteLocal: [] })
  })

  it('로컬·원격이 같은 새 내용으로 수렴(R=L≠base) → 전송 없음 (마커만 갱신)', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'X', syncedVersion: 'base' })],
      manifest({ a: { version: 'X' } }),
    )
    expect(plan.toPush).toEqual([])
    expect(plan.toPull).toEqual([])
    expect(plan.conflicts).toEqual([])
  })
})

describe('computeSyncPlan — 충돌', () => {
  it('로컬·원격 모두 base에서 갈라짐(L≠base, R≠base, L≠R) → conflict', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'L2', syncedVersion: 'L1' })],
      manifest({ a: { version: 'R2' } }),
    )
    expect(plan.conflicts).toEqual(['a'])
    expect(plan.toPush).toEqual([])
    expect(plan.toPull).toEqual([])
  })
})

describe('computeSyncPlan — 삭제/tombstone', () => {
  it('로컬 삭제 + 원격 base 유지 → toTombstone', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'L1', syncedVersion: 'L1', deleted: true })],
      manifest({ a: { version: 'L1' } }),
    )
    expect(plan.toTombstone).toEqual(['a'])
  })

  it('원격 tombstone + 로컬 base 이후 변경 없음 → toDeleteLocal', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'L1', syncedVersion: 'L1' })],
      manifest({}, { a: 500 }),
    )
    expect(plan.toDeleteLocal).toEqual(['a'])
  })

  it('원격 tombstone + 로컬 변경(L≠base) → 삭제-편집 충돌', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'L2', syncedVersion: 'L1' })],
      manifest({}, { a: 500 }),
    )
    expect(plan.conflicts).toEqual(['a'])
    expect(plan.toDeleteLocal).toEqual([])
  })

  it('로컬 삭제 + 원격 변경(R≠base) → 삭제-편집 충돌', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'L1', syncedVersion: 'L1', deleted: true })],
      manifest({ a: { version: 'R2' } }),
    )
    expect(plan.conflicts).toEqual(['a'])
    expect(plan.toTombstone).toEqual([])
  })

  it('로컬·원격 모두 삭제(tombstone) → 전송 없음', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'a', version: 'L1', syncedVersion: 'L1', deleted: true })],
      manifest({}, { a: 500 }),
    )
    expect(plan).toEqual({ toPush: [], toPull: [], conflicts: [], toTombstone: [], toDeleteLocal: [] })
  })

  it('tombstone 부활 방지: 원격 tombstone + 로컬에 없음 → 아무것도 안 함', () => {
    const plan = computeSyncPlan([], manifest({}, { a: 500 }))
    expect(plan).toEqual({ toPush: [], toPull: [], conflicts: [], toTombstone: [], toDeleteLocal: [] })
  })
})

describe('computeSyncPlan — 결정론', () => {
  it('출력 배열은 uuid 오름차순 정렬 (재현성)', () => {
    const plan = computeSyncPlan(
      [local({ uuid: 'c', version: 'n' }), local({ uuid: 'a', version: 'n' })],
      emptyManifest(0),
    )
    expect(plan.toPush).toEqual(['a', 'c'])
  })
})
