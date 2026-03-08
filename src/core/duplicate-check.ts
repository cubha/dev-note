// src/core/duplicate-check.ts
//
// 카드 저장 시 중복 호스트/URL 경고를 위한 유틸리티
// - server/db: host 필드 비교
// - api: url 필드 비교
// - note/custom: 중복 체크 없음

import { db } from './db'
import type { ItemType } from './db'
import { parseContent } from './content'

export interface DuplicateMatch {
  itemId: number
  title: string
  matchField: string   // 'host' | 'url'
  matchValue: string
}

/** 중복 체크 대상 키 맵 */
const CHECK_KEYS: Partial<Record<ItemType, string>> = {
  server: 'host',
  db: 'host',
  api: 'url',
}

/**
 * 저장하려는 카드의 핵심 필드(host/url)가 이미 존재하는지 DB에서 확인한다.
 * @param type    카드 타입
 * @param fields  저장하려는 필드 배열
 * @param excludeId  편집 모드 시 자기 자신 제외
 * @returns 중복 매칭 목록 (빈 배열 = 중복 없음)
 */
export async function checkDuplicates(
  type: ItemType,
  fields: Array<{ key: string; value: string }>,
  excludeId?: number,
): Promise<DuplicateMatch[]> {
  const checkKey = CHECK_KEYS[type]
  if (!checkKey) return []

  const targetValue = fields.find((f) => f.key === checkKey)?.value?.trim()
  if (!targetValue) return []

  // 같은 타입의 기존 아이템 조회
  const existingItems = await db.items.where('type').equals(type).toArray()

  const matches: DuplicateMatch[] = []

  for (const item of existingItems) {
    if (excludeId !== undefined && item.id === excludeId) continue

    const content = parseContent(item.content)
    if (content.format !== 'structured') continue

    const existingValue = content.fields.find((f) => f.key === checkKey)?.value?.trim()
    if (!existingValue) continue

    // 정규화 비교 (대소문자 무시, 프로토콜 무시)
    if (normalizeValue(existingValue, checkKey) === normalizeValue(targetValue, checkKey)) {
      matches.push({
        itemId: item.id,
        title: item.title,
        matchField: checkKey,
        matchValue: existingValue,
      })
    }
  }

  return matches
}

/** 비교를 위한 값 정규화 */
function normalizeValue(value: string, key: string): string {
  let v = value.toLowerCase().trim()
  if (key === 'url') {
    // 프로토콜, 후행 슬래시 제거
    v = v.replace(/^https?:\/\//, '').replace(/\/+$/, '')
  }
  return v
}
