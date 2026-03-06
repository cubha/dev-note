// src/features/storage/export.ts
//
// 내보내기 로직
// - DB 전체 덤프 → ExportSchema JSON 생성
// - FSAA (Chrome/Edge) + Blob URL 폴백 (Firefox/Safari)
// - 완료 후 lastExportAt 갱신

import { db } from '../../core/db'
import type { Folder, Item } from '../../core/db'
import type { ExportSchema } from './schema'

// ─── 날짜 포맷 유틸 ────────────────────────────────────────────

function formatDateForFilename(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

// ─── 파일 저장 (FSAA + Blob 폴백) ─────────────────────────────

async function saveToFile(content: string, fileName: string): Promise<void> {
  if ('showSaveFilePicker' in window) {
    // 1순위: File System Access API (Chrome/Edge)
    const fsaaWindow = window as Window & {
      showSaveFilePicker: (opts: {
        suggestedName?: string
        types?: Array<{ description: string; accept: Record<string, string[]> }>
        startIn?: string
      }) => Promise<{
        createWritable: () => Promise<{
          write: (data: string) => Promise<void>
          close: () => Promise<void>
        }>
      }>
    }

    const handle = await fsaaWindow.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: 'JSON Backup', accept: { 'application/json': ['.json'] } }],
      startIn: 'downloads',
    })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  } else {
    // 폴백: Blob URL + <a download> (Firefox/Safari)
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    requestAnimationFrame(() => {
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
    })
  }
}

// ─── 내보내기 진입점 ───────────────────────────────────────────

export async function exportData(): Promise<void> {
  // 1. DB 전체 읽기
  const [folders, items, config] = await Promise.all([
    db.folders.toArray(),
    db.items.toArray(),
    db.config.get(1),
  ])

  // 2. ExportSchema 구성
  //    - folders: id 포함 (Append 가져오기 시 folderId 리매핑에 필요)
  //    - items: id 제외 (가져오기 시 auto-increment 재할당)
  const exportedAt = Date.now()
  const schema: ExportSchema = {
    version: 1,
    exportedAt,
    cryptoEnabled: config?.cryptoEnabled ?? false,
    saltHex: config?.saltHex ?? null,
    canaryBlock: config?.canaryBlock ?? null,
    canaryIv: config?.canaryIv ?? null,
    folders,
    items: items.map((item): Omit<Item, 'id'> => ({
      folderId: item.folderId,
      title: item.title,
      type: item.type,
      tags: item.tags,
      order: item.order,
      encryptedContent: item.encryptedContent,
      iv: item.iv,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
    })),
  }

  // 3. JSON 직렬화 + 파일 저장
  const content = JSON.stringify(schema, null, 2)
  const fileName = `devnote-backup-${formatDateForFilename(exportedAt)}.json`
  await saveToFile(content, fileName)

  // 4. lastExportAt 갱신
  await db.config.update(1, { lastExportAt: exportedAt })
}

// ─── 선택 항목 내보내기 ────────────────────────────────────────
// 암호화 정책: 항목을 암호화된 상태 그대로 내보냄 (복호화 없음)
// 가져오기 시 동일한 마스터 패스워드를 가진 사용자만 복호화 가능

export async function exportSelectedItems(itemIds: number[]): Promise<void> {
  const [allFolders, config] = await Promise.all([
    db.folders.toArray(),
    db.config.get(1),
  ])

  // 선택된 항목만 조회
  const selectedItemsData = await db.items.bulkGet(itemIds)
  const validItems = selectedItemsData.filter((i): i is Item => i !== undefined)

  // 항목이 참조하는 폴더 및 그 조상 폴더 ID 수집
  const neededFolderIds = new Set<number>()

  const collectAncestors = (folderId: number | null) => {
    if (folderId === null || neededFolderIds.has(folderId)) return
    neededFolderIds.add(folderId)
    const folder = allFolders.find((f) => f.id === folderId)
    if (folder?.parentId !== null && folder?.parentId !== undefined) {
      collectAncestors(folder.parentId)
    }
  }

  for (const item of validItems) {
    collectAncestors(item.folderId)
  }

  const exportFolders: Folder[] = allFolders.filter((f) => neededFolderIds.has(f.id))

  const exportedAt = Date.now()
  const schema: ExportSchema = {
    version: 1,
    exportedAt,
    cryptoEnabled: config?.cryptoEnabled ?? false,
    saltHex: config?.saltHex ?? null,
    canaryBlock: config?.canaryBlock ?? null,
    canaryIv: config?.canaryIv ?? null,
    folders: exportFolders,
    items: validItems.map((item): Omit<Item, 'id'> => ({
      folderId: item.folderId,
      title: item.title,
      type: item.type,
      tags: item.tags,
      order: item.order,
      encryptedContent: item.encryptedContent,
      iv: item.iv,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
    })),
  }

  const content = JSON.stringify(schema, null, 2)
  const fileName = `devnote-selected-${formatDateForFilename(exportedAt)}.json`
  await saveToFile(content, fileName)
}
