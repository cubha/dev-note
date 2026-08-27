import { describe, it, expect } from 'vitest'
import { bucketFailures } from '../core/errorBuckets'

describe('bucketFailures', () => {
  it('인증 관련 코드를 auth 버킷으로 묶는다', () => {
    const result = bucketFailures([
      { code: 'auth_error', count: 3 },
      { code: 'permission_error', count: 2 },
      { code: 'byok_auth_error', count: 1 },
    ])
    const auth = result.find((b) => b.bucket === 'auth')
    expect(auth?.count).toBe(6)
    expect(auth?.codes.sort()).toEqual(['auth_error', 'byok_auth_error', 'permission_error'])
  })

  it('rate limit 관련 코드를 rate_limit 버킷으로 묶는다', () => {
    const result = bucketFailures([
      { code: 'anthropic_rate_limit', count: 5 },
      { code: 'byok_quota_exceeded', count: 2 },
    ])
    const rl = result.find((b) => b.bucket === 'rate_limit')
    expect(rl?.count).toBe(7)
  })

  it('서버 과부하/차단 코드를 server 버킷으로 묶는다', () => {
    const result = bucketFailures([
      { code: 'overloaded', count: 4 },
      { code: 'cloudflare_challenge', count: 1 },
    ])
    const server = result.find((b) => b.bucket === 'server')
    expect(server?.count).toBe(5)
  })

  it('알 수 없는 코드는 unknown 버킷으로 묶인다', () => {
    const result = bucketFailures([
      { code: 'unknown', count: 2 },
      { code: 'totally_new_code', count: 1 },
    ])
    const unknown = result.find((b) => b.bucket === 'unknown')
    expect(unknown?.count).toBe(3)
  })

  it('count 내림차순으로 정렬한다', () => {
    const result = bucketFailures([
      { code: 'unknown', count: 1 },
      { code: 'anthropic_rate_limit', count: 10 },
      { code: 'auth_error', count: 5 },
    ])
    expect(result.map((b) => b.count)).toEqual([...result.map((b) => b.count)].sort((a, b) => b - a))
  })

  it('빈 입력이면 빈 배열', () => {
    expect(bucketFailures([])).toEqual([])
  })

  it('count가 0인 버킷은 결과에서 제외한다', () => {
    const result = bucketFailures([{ code: 'auth_error', count: 0 }])
    expect(result).toEqual([])
  })
})
