// src/features/storage/useImportTextCard.ts
//
// 단일 텍스트 파일(txt/md) 가져오기의 공용 진입점. 진입점이 3곳(가져오기 메뉴 · 사이드바
// DnD · 메인 화면 DnD)이라 잠금/피드백/탭 오픈 규칙을 여기 한 곳에 통일한다 —
// useExportItemMarkdown.ts(내보내기)와 대칭 설계.

import { useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { appConfigAtom, encryptionKeyAtom, selectedFolderAtom, openTabsAtom, activeTabAtom } from '../../store/atoms'
import { openTab } from '../../store/tabHelpers'
import { classifyImportFile, MAX_IMPORT_FILE_BYTES } from '../../core/importCard'
import { importTextFilesAsCards } from './importTextCard'
import { openTextFile } from './fileOpen'

export function useImportTextCard(): {
  importFromPicker: () => Promise<void>
  importFiles: (files: File[]) => Promise<void>
} {
  const appConfig = useAtomValue(appConfigAtom)
  const encryptionKey = useAtomValue(encryptionKeyAtom)
  const selectedFolder = useAtomValue(selectedFolderAtom)
  const setOpenTabs = useSetAtom(openTabsAtom)
  const setActiveTab = useSetAtom(activeTabAtom)

  const encryptionEnabled = appConfig?.encryptionEnabled ?? false

  const runImport = useCallback(
    async (inputs: Array<{ name: string; text: string }>, rejectedNames: string[]) => {
      if (rejectedNames.length > 0) {
        toast.warning(`지원하지 않는 파일: ${rejectedNames.join(', ')} (txt·md만 가능, 5MB 이하)`, {
          duration: 3500,
        })
      }
      if (inputs.length === 0) return

      const summary = await importTextFilesAsCards(inputs, selectedFolder, encryptionEnabled, encryptionKey)

      for (const c of summary.created) {
        openTab(c.itemId, setOpenTabs, setActiveTab)
      }

      if (summary.created.length === 1) {
        toast.success(`"${summary.created[0].title}" 카드로 추가됨`, { duration: 2000 })
      } else if (summary.created.length > 1) {
        toast.success(`${summary.created.length}개 파일을 카드로 추가했습니다`, { duration: 2000 })
      }

      if (summary.locked > 0) {
        toast.error('잠긴 상태에서는 가져올 수 없습니다 — 설정 → 보안에서 잠금을 해제해 주세요.', {
          duration: 3000,
        })
      }
    },
    [selectedFolder, encryptionEnabled, encryptionKey, setOpenTabs, setActiveTab],
  )

  const importFromPicker = useCallback(async () => {
    try {
      const file = await openTextFile()
      await runImport([{ name: file.name, text: file.text }], [])
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : '가져오기에 실패했습니다.'
      toast.error(message, { duration: 3000 })
    }
  }, [runImport])

  const importFiles = useCallback(
    async (files: File[]) => {
      const accepted: Array<{ name: string; text: string }> = []
      const rejected: string[] = []
      let sawJson = false

      for (const file of files) {
        const kind = classifyImportFile(file.name)
        if (kind === 'json') {
          sawJson = true
          continue
        }
        if (kind === 'unsupported' || file.size > MAX_IMPORT_FILE_BYTES) {
          rejected.push(file.name)
          continue
        }
        accepted.push({ name: file.name, text: await file.text() })
      }

      if (sawJson) {
        toast.info('JSON 백업은 사이드바 → 가져오기 → "JSON 백업"에서 불러오세요', { duration: 3500 })
      }

      try {
        await runImport(accepted, rejected)
      } catch (err) {
        const message = err instanceof Error ? err.message : '가져오기에 실패했습니다.'
        toast.error(message, { duration: 3000 })
      }
    },
    [runImport],
  )

  return { importFromPicker, importFiles }
}
