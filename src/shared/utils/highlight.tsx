/** 검색어 직접 매칭으로 텍스트 내 모든 출현 위치 하이라이트 */
export function highlightByQuery(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const lower = text.toLowerCase()
  const lowerQ = query.toLowerCase()
  const parts: React.ReactNode[] = []
  let lastIdx = 0
  let idx = lower.indexOf(lowerQ, lastIdx)
  if (idx === -1) return text
  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx))
    parts.push(
      <mark key={idx} className="search-hl">
        {text.slice(idx, idx + query.length)}
      </mark>,
    )
    lastIdx = idx + query.length
    idx = lower.indexOf(lowerQ, lastIdx)
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return <>{parts}</>
}
