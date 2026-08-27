export interface CodeCount {
  code: string
  count: number
}

export interface ErrorBucket {
  bucket: string
  label: string
  count: number
  codes: string[]
}

/**
 * api/v1/messages.ts·error-report.ts가 분류하는 에러 code 문자열(auth_error,
 * anthropic_rate_limit, overloaded 등)을 대시보드 표시용 상위 버킷으로 묶는다.
 * 새 code가 추가돼도 여기 등록 전까지는 unknown 버킷으로 안전하게 떨어진다.
 */
const BUCKET_OF: Record<string, string> = {
  auth_error: 'auth',
  permission_error: 'auth',
  byok_auth_error: 'auth',
  anthropic_rate_limit: 'rate_limit',
  byok_quota_exceeded: 'rate_limit',
  report_limit_exceeded: 'rate_limit',
  overloaded: 'server',
  cloudflare_challenge: 'server',
}

const BUCKET_LABELS: Record<string, string> = {
  auth: '인증 오류',
  rate_limit: '사용량 한도',
  server: '서버 과부하/차단',
  unknown: '기타',
}

/** raw per-code 실패 카운트를 상위 버킷으로 집계해 count 내림차순으로 반환한다. */
export function bucketFailures(counts: CodeCount[]): ErrorBucket[] {
  const buckets = new Map<string, ErrorBucket>()

  for (const { code, count } of counts) {
    const bucketKey = BUCKET_OF[code] ?? 'unknown'
    const existing = buckets.get(bucketKey)
    if (existing) {
      existing.count += count
      if (!existing.codes.includes(code)) existing.codes.push(code)
    } else {
      buckets.set(bucketKey, {
        bucket: bucketKey,
        label: BUCKET_LABELS[bucketKey] ?? bucketKey,
        count,
        codes: [code],
      })
    }
  }

  return [...buckets.values()]
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count)
}
