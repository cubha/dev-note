// src/features/storage/import.ts
//
// 가져오기 로직
// - FSAA (Chrome/Edge) + <input type="file"> 폴백 (Firefox/Safari)
// - Append 전략: 기존 데이터 유지 + 가져온 데이터 추가
// - Replace 전략: 기존 데이터 전체 삭제 → 새 데이터 삽입
// - 2-pass 폴더 삽입으로 parentId 리매핑 처리
// - Dexie 트랜잭션으로 원자적 처리 (실패 시 자동 롤백)
// - v1(암호화) / v2(평문) 백업 파일 모두 호환

import { db } from '../../core/db'
import type { Folder, Item } from '../../core/db'
import { isValidExportSchema, convertLegacyItem } from './schema'
import { isEncryptedBackup, unwrapEnvelope } from './envelope'

// ─── 파일 읽기 (FSAA + input 폴백) ────────────────────────────

async function readFromInput(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.style.display = 'none'
    document.body.appendChild(input)

    input.onchange = () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) {
        reject(new DOMException('파일이 선택되지 않았습니다', 'AbortError'))
        return
      }
      file.text().then(resolve).catch(reject)
    }

    const onFocus = () => {
      setTimeout(() => {
        if (input.isConnected && !input.files?.length) {
          document.body.removeChild(input)
          reject(new DOMException('사용자가 취소했습니다', 'AbortError'))
        }
      }, 300)
    }
    window.addEventListener('focus', onFocus, { once: true })

    input.click()
  })
}

export async function importFromFile(): Promise<string> {
  if ('showOpenFilePicker' in window) {
    const fsaaWindow = window as Window & {
      showOpenFilePicker: (opts: {
        types?: Array<{ description: string; accept: Record<string, string[]> }>
        multiple?: boolean
        excludeAcceptAllOption?: boolean
      }) => Promise<[{ getFile: () => Promise<File> }]>
    }

    const [handle] = await fsaaWindow.showOpenFilePicker({
      types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    })
    const file = await handle.getFile()
    return file.text()
  } else {
    return readFromInput()
  }
}

// ─── 백업 종류 감지 / 봉투 복호화 (가져오기 상류 1회) ─────────

export type BackupType = 'plain' | 'encrypted' | 'invalid'

// 파일 내용을 파싱하지 않고 봉투/평문/무효를 판별한다 (복호화 전 분기용)
export function detectBackupType(rawText: string): BackupType {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return 'invalid'
  }
  // 봉투 검사를 평문 스키마 검사보다 먼저 (봉투는 folders/items가 없어 오인 거부됨)
  if (isEncryptedBackup(parsed)) return 'encrypted'
  if (isValidExportSchema(parsed)) return 'plain'
  return 'invalid'
}

// 봉투를 복호화하여 평문 ExportSchema JSON 문자열을 반환한다.
// 이후 단계(parseImportPreview/importData)는 이 평문만 처리한다 (아키텍처 A).
export async function decryptBackup(rawText: string, passphrase: string): Promise<string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('유효하지 않은 JSON 형식입니다')
  }
  if (!isEncryptedBackup(parsed)) {
    throw new Error('암호화된 백업 파일이 아닙니다')
  }
  // 패스프레이즈 불일치 시 unwrapEnvelope가 친절한 에러를 throw
  const schema = await unwrapEnvelope(parsed, passphrase)
  // 복호화 성공 ≠ 스키마 유효성 보장 — 손상/버전 불일치 봉투 방어 (scope-critic 지적)
  if (!isValidExportSchema(schema)) {
    throw new Error('복호화된 데이터가 올바른 백업 형식이 아닙니다')
  }
  return JSON.stringify(schema)
}

// ─── 미리보기 파싱 (DB 미쓰기, 모달 표시용) ───────────────────

export interface ImportPreview {
  folders: number
  items: number
  encrypted?: boolean   // true: 가져올 파일에 암호화된 content가 있음
}

export async function parseImportPreview(rawText: string): Promise<ImportPreview> {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('유효하지 않은 JSON 형식입니다')
  }

  // 봉투는 복호화 후의 평문으로만 들어와야 함 — 미복호화 봉투를 명확히 안내
  if (isEncryptedBackup(parsed)) {
    throw new Error('암호화된 백업입니다 — 패스프레이즈로 먼저 복호화해야 합니다')
  }
  if (!isValidExportSchema(parsed)) {
    throw new Error('파일 형식이 dev-note 백업 형식과 다릅니다')
  }

  return {
    folders: parsed.folders.length,
    items: parsed.items.length,
    encrypted: parsed.encrypted === true,
  }
}

// ─── 가져오기 진입점 ───────────────────────────────────────────

export interface ImportResult {
  mode: 'append' | 'replace'
  foldersAdded: number
  itemsAdded: number
}

export async function importData(
  rawText: string,
  mode: 'append' | 'replace' = 'append',
): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('유효하지 않은 JSON 형식입니다')
  }

  if (isEncryptedBackup(parsed)) {
    throw new Error('암호화된 백업입니다 — 패스프레이즈로 먼저 복호화해야 합니다')
  }
  if (!isValidExportSchema(parsed)) {
    throw new Error('파일 형식이 dev-note 백업 형식과 다릅니다')
  }

  // ── 폴더·항목 삽입 헬퍼 (Append / Replace 공용) ──────────────
  const insertFoldersAndItems = async () => {
    // Pass 1: 모든 폴더를 parentId=null로 추가 → 새 ID 배열 획득
    const foldersToInsert: Omit<Folder, 'id'>[] = parsed.folders.map(
      (f: Folder): Omit<Folder, 'id'> => ({
        parentId: null,
        name: f.name,
        order: f.order,
        createdAt: f.createdAt,
      }),
    )

    const newFolderIds = (await db.folders.bulkAdd(
      foldersToInsert,
      { allKeys: true },
    )) as number[]

    if (newFolderIds.length !== foldersToInsert.length) {
      throw new Error(`폴더 삽입 수 불일치: 예상 ${foldersToInsert.length}개, 실제 ${newFolderIds.length}개`)
    }

    // 구 ID → 신 ID 매핑 테이블 구성
    const folderIdMap = new Map<number, number>()
    parsed.folders.forEach((f: Folder, i: number) => {
      folderIdMap.set(f.id, newFolderIds[i])
    })

    // Pass 2: 서브폴더 parentId를 신 ID로 업데이트
    for (let i = 0; i < parsed.folders.length; i++) {
      const oldFolder = parsed.folders[i] as Folder
      if (oldFolder.parentId !== null) {
        const newParentId = folderIdMap.get(oldFolder.parentId) ?? null
        await db.folders.update(newFolderIds[i], { parentId: newParentId })
      }
    }

    // 항목 folderId 리매핑 후 일괄 추가 (v1 → v2 변환 포함)
    const itemsToInsert: Omit<Item, 'id'>[] = parsed.items.map(
      (rawItem: Record<string, unknown>): Omit<Item, 'id'> => {
        const converted = convertLegacyItem(rawItem)
        return {
          ...converted,
          folderId: converted.folderId !== null
            ? (folderIdMap.get(converted.folderId) ?? null)
            : null,
        }
      },
    )

    await db.items.bulkAdd(itemsToInsert)
  }

  if (mode === 'replace') {
    await db.transaction('rw', [db.folders, db.items], async () => {
      await db.folders.clear()
      await db.items.clear()
      await insertFoldersAndItems()
    })
  } else {
    await db.transaction('rw', [db.folders, db.items], async () => {
      await insertFoldersAndItems()
    })
  }

  return {
    mode,
    foldersAdded: parsed.folders.length,
    itemsAdded: parsed.items.length,
  }
}
