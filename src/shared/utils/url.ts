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
