import type { Item } from './db'
import type { CardContent, AnySection } from './types'
import { TYPE_META } from './types'

// core는 shared/에 의존하지 않는다(shared가 core를 참조하는 방향이라 역참조하면 순환).
// SECTION_META(shared/constants.ts)와 중복이지만 라벨 문자열만 최소 복제한다.
const SECTION_DEFAULT_TITLE: Record<AnySection['type'], string> = {
  markdown: '메모',
  credentials: '접속 정보',
  urls: 'URL',
  env: '환경변수',
  code: '코드',
}

/**
 * 카드를 평문 마크다운으로 렌더링한다(F3). password 필드·secret env 값은 절대 포함하지
 * 않는다 — extractSearchText(Fuse 인덱싱용 lossy 추출기)와 달리 full-fidelity를
 * 목표로 하되 secret 배제 기조는 동일하게 유지한다. 잠금(암호화)된 카드는 이 함수
 * 호출 전에(호출부에서) 거부해야 한다 — 여기는 평문 CardContent만 받는다는 전제.
 */
export function cardToMarkdown(item: Item, content: CardContent): string {
  const lines: string[] = []
  lines.push(`# ${item.title || '제목없음'}`)
  lines.push('')
  lines.push(`**타입**: ${TYPE_META[item.type].label}`)
  if (item.tags.length > 0) lines.push(`**태그**: ${item.tags.join(', ')}`)
  lines.push('')

  if (content.format === 'legacy') {
    if (content.text) lines.push(content.text)
  } else if (content.format === 'structured') {
    const visible = content.fields.filter((f) => f.type !== 'password' && f.value.trim() !== '')
    for (const f of visible) {
      lines.push(`- **${f.label}**: ${f.value}`)
    }
  } else {
    for (const section of content.sections) {
      lines.push(...renderSection(section), '')
    }
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function renderSection(section: AnySection): string[] {
  const heading = `## ${section.title || SECTION_DEFAULT_TITLE[section.type]}`
  const lines: string[] = [heading, '']

  switch (section.type) {
    case 'markdown':
      if (section.text) lines.push(section.text)
      break
    case 'credentials':
      for (const entry of section.items) {
        const parts = [`${entry.host}:${entry.port}`, `(${entry.username})`]
        if (entry.database) parts.push(`db=${entry.database}`)
        lines.push(`- **${entry.label}**: ${parts.join(' ')}`)
        if (entry.extra) lines.push(`  ${entry.extra}`)
      }
      break
    case 'urls':
      for (const entry of section.items) {
        const methodPart = entry.method ? `[${entry.method}] ` : ''
        lines.push(`- **${entry.label}**: ${methodPart}${entry.url}`)
        if (entry.note) lines.push(`  ${entry.note}`)
        for (const card of entry.noteCards ?? []) {
          if (card.title) lines.push(`  - ${card.title}`)
          if (card.text) lines.push(`    ${card.text}`)
        }
      }
      break
    case 'env':
      for (const pair of section.pairs) {
        lines.push(`- ${pair.key}=${pair.secret ? '••••••' : pair.value}`)
      }
      break
    case 'code':
      lines.push(`\`\`\`${section.language}`, section.code, '```')
      break
  }

  return lines
}
