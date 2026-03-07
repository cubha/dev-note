// src/features/storage/schema.ts
//
// 내보내기 파일 스키마 정의 및 타입가드
// - folders: id 포함 (Append 가져오기 시 folderId 리매핑에 필요)
// - items: id 제외 (가져오기 시 auto-increment로 재할당)

import type { Folder, Item, ItemType } from '../../core/db'

// ─── 내보내기 파일 최상위 구조 ─────────────────────────────────

export interface ExportSchema {
  version: number
  exportedAt: number
  cryptoEnabled: boolean
  saltHex: string | null      // PBKDF2 복원용 — 없으면 암호화 항목 복호화 불가
  canaryBlock: string | null  // 패스워드 검증용
  canaryIv: string | null
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

const VALID_ITEM_TYPES: ItemType[] = ['server', 'db', 'api', 'note', 'custom']
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

function isItem(value: unknown): value is Omit<Item, 'id'> {
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

// ─── 최상위 스키마 검증 ────────────────────────────────────────

export function isValidExportSchema(data: unknown): data is ExportSchema {
  if (!isObject(data)) return false
  if (!isNumber(data.version)) return false
  if (!isNumber(data.exportedAt)) return false
  if (typeof data.cryptoEnabled !== 'boolean') return false
  if (!isNullOrString(data.saltHex)) return false
  if (!isNullOrString(data.canaryBlock)) return false
  if (!isNullOrString(data.canaryIv)) return false
  if (!Array.isArray(data.folders)) return false
  if (!Array.isArray(data.items)) return false
  if (!data.folders.every(isFolder)) return false
  if (!data.items.every(isItem)) return false
  return true
}
