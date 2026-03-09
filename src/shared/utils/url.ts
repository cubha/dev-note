/**
 * URL을 새 탭에서 연다.
 * 보안: noopener, noreferrer 적용
 */
export function openUrl(url: string): void {
  let normalizedUrl = url.trim()
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`
  }
  window.open(normalizedUrl, '_blank', 'noopener,noreferrer')
}

/** http/https 프로토콜만 허용 — javascript: XSS 방지 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
