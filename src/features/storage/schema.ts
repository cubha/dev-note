// src/features/storage/schema.ts
//
// 내보내기 파일 스키마 정의 및 타입가드
// - v2: 암호화 제거, content 평문 필드
// - v1 호환: encryptedContent/iv → content로 변환하여 가져오기 가능

import type { Folder, Item, ItemType } from '../../core/db'

// ─── 내보내기 파일 최상위 구조 ─────────────────────────────────

export interface ExportSchema {
  version: number
  exportedAt: number
  folders: Folder[]           // id 포함
  items: Omit<Item, 'id'>[]   // id 제외
}

// ─── 기본 타입가드 유틸 ────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString)
}

function isNullOrString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isNullOrNumber(value: unknown): value is number | null {
  return value === null || isNumber(value)
}

// ─── 도메인 타입가드 ───────────────────────────────────────────

const VALID_ITEM_TYPES: ItemType[] = ['server', 'db', 'api', 'note', 'custom', 'document']
export const LEGACY_TYPE_MAP: Record<string, ItemType> = { ssh: 'server', http: 'api' }

function isValidItemType(value: unknown): value is ItemType {
  if (typeof value !== 'string') return false
  return VALID_ITEM_TYPES.includes(value as ItemType) || value in LEGACY_TYPE_MAP
}

function isFolder(value: unknown): value is Folder {
  if (!isObject(value)) return false
  return (
    isNumber(value.id) &&
    isNullOrNumber(value.parentId) &&
    isString(value.name) &&
    isNumber(value.order) &&
    isNumber(value.createdAt)
  )
}

// v2 아이템 (content 필드)
function isItemV2(value: unknown): value is Omit<Item, 'id'> {
  if (!isObject(value)) return false
  return (
    isNullOrNumber(value.folderId) &&
    isString(value.title) &&
    isValidItemType(value.type) &&
    isStringArray(value.tags) &&
    isNumber(value.order) &&
    isString(value.content) &&
    isNumber(value.updatedAt) &&
    isNumber(value.createdAt)
  )
}

// v1 아이템 (encryptedContent/iv 필드 — 레거시)
function isItemV1(value: unknown): boolean {
  if (!isObject(value)) return false
  return (
    isNullOrNumber(value.folderId) &&
    isString(value.title) &&
    isValidItemType(value.type) &&
    isStringArray(value.tags) &&
    isNumber(value.order) &&
    isNullOrString(value.encryptedContent) &&
    isNullOrString(value.iv) &&
    isNumber(value.updatedAt) &&
    isNumber(value.createdAt)
  )
}

function isItem(value: unknown): boolean {
  return isItemV2(value) || isItemV1(value)
}

// ─── v1 → v2 아이템 변환 ──────────────────────────────────────

export function convertLegacyItem(raw: Record<string, unknown>): Omit<Item, 'id'> {
  // 이미 v2 형식이면 그대로 반환
  if (typeof raw.content === 'string') {
    return raw as unknown as Omit<Item, 'id'>
  }
  // v1: encryptedContent → content (iv가 없으면 평문, 있으면 복호화 불가 → 빈 구조)
  let content: string
  if (raw.encryptedContent && !raw.iv) {
    content = raw.encryptedContent as string
  } else {
    content = JSON.stringify({ format: 'structured', fields: [] })
  }
  return {
    folderId: (raw.folderId as number | null) ?? null,
    title: raw.title as string,
    type: (LEGACY_TYPE_MAP[raw.type as string] ?? raw.type) as ItemType,
    tags: raw.tags as string[],
    order: raw.order as number,
    pinned: (raw.pinned as boolean) ?? false,
    content,
    updatedAt: raw.updatedAt as number,
    createdAt: raw.createdAt as number,
  }
}

// ─── 최상위 스키마 검증 ────────────────────────────────────────

export function isValidExportSchema(data: unknown): data is ExportSchema {
  if (!isObject(data)) return false
  if (!isNumber(data.version)) return false
  if (!isNumber(data.exportedAt)) return false
  if (!Array.isArray(data.folders)) return false
  if (!Array.isArray(data.items)) return false
  if (!data.folders.every(isFolder)) return false
  if (!data.items.every(isItem)) return false
  return true
}
