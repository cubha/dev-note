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

// ─── 미리보기 파싱 (DB 미쓰기, 모달 표시용) ───────────────────

export interface ImportPreview {
  folders: number
  items: number
}

export async function parseImportPreview(rawText: string): Promise<ImportPreview> {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error('유효하지 않은 JSON 형식입니다')
  }

  if (!isValidExportSchema(parsed)) {
    throw new Error('파일 형식이 dev-note 백업 형식과 다릅니다')
  }

  return {
    folders: parsed.folders.length,
    items: parsed.items.length,
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
