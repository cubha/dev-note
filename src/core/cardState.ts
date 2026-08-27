import type { CardContent, AnySection } from './types'
import type { Item } from './db'

/** 섹션 하나가 "내용 없음"인지 — title은 판정에서 제외한다(빈 문서 기본 섹션에 title='메모'가 있음) */
const isSectionEmpty = (section: AnySection): boolean => {
  switch (section.type) {
    case 'markdown':
      return section.text.trim() === ''
    case 'credentials':
    case 'urls':
      return section.items.length === 0
    case 'env':
      return section.pairs.length === 0
    case 'code':
      return section.code.trim() === ''
  }
}

/** content가 "내용 없음"인지 — 포맷별 분기(legacy/structured/hybrid) */
const isContentEmpty = (content: CardContent): boolean => {
  if (content.format === 'legacy') return content.text.trim() === ''
  if (content.format === 'hybrid') return content.sections.every(isSectionEmpty)
  return content.fields.every((f) => f.value.trim() === '')
}

/** 제목·내용이 전부 비어 있는 카드인지 — draft 판정의 기준(F1 1안: 비었을 때만 draft) */
export const isCardEmpty = (title: string, content: CardContent): boolean => {
  return title.trim() === '' && isContentEmpty(content)
}

/**
 * item이 draft(미저장 새 카드)인지 판정하는 단일 술어.
 * undefined도 non-draft로 취급 — 이 함수 밖에서 item.draft를 직접 읽지 않는다.
 */
export const isDraft = (item: Pick<Item, 'draft'>): boolean => item.draft === true
