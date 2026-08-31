// src/features/storage/GlobalFileDropZone.tsx
//
// 앱 어디든(사이드바·메인 화면) OS 파일을 드롭하면 즉시 카드화한다. 컴포넌트별
// 드롭존이 아니라 window 레벨 단일 오버레이 — 누락 없이 전체를 커버하고, 내부
// 카드 드래그(CardGrid)와의 충돌 지점을 1곳으로 모은다.

import { useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import { blockingDialogOpenAtom } from '../../store/atoms'
import { useImportTextCard } from './useImportTextCard'

function hasFiles(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') ?? false
}

export function GlobalFileDropZone() {
  const [active, setActive] = useState(false)
  const blockingDialogOpen = useAtomValue(blockingDialogOpenAtom)
  const { importFiles } = useImportTextCard()

  useEffect(() => {
    // dragleave는 자식 요소를 지날 때마다 발화한다 — 단순 show/hide면 오버레이가
    // 계속 깜빡인다. depth 카운터로 "화면 밖으로 완전히 나갔을 때"만 감춘다.
    let depth = 0

    const reset = () => {
      depth = 0
      setActive(false)
    }

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e) || blockingDialogOpen) return
      depth++
      setActive(true)
    }

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setActive(false)
    }

    const onDragOver = (e: DragEvent) => {
      // 무조건 preventDefault — 없으면 Chrome이 드롭된 파일로 페이지를 이탈한다
      // (이 앱은 미저장 draft를 들고 있어 데이터 손실로 이어진다).
      e.preventDefault()
      if (hasFiles(e) && e.dataTransfer) {
        e.dataTransfer.dropEffect = blockingDialogOpen ? 'none' : 'copy'
      }
    }

    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer?.files ?? [])
      reset()
      if (blockingDialogOpen || files.length === 0) return
      void importFiles(files)
    }

    // OS 파일 드래그는 dragend/dragleave를 페이지로 보내지 않을 수 있다 — 창 포커스를
    // 유지한 채 ESC로 드래그만 취소하면 dragend가, 창 밖으로 이탈하면 blur가 필요하다.
    // 두 경로 다 없으면 depth가 0으로 못 돌아와 오버레이가 뜬 채 남는다.
    const onWindowDragEnd = () => reset()
    const onWindowBlur = () => reset()

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onWindowDragEnd)
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onWindowDragEnd)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [importFiles, blockingDialogOpen])

  if (!active) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] pointer-events-none" aria-hidden>
      <div className="rounded-lg border-2 border-dashed border-[var(--border-accent)] bg-[var(--bg-surface-raised)] px-8 py-6 text-center">
        <p className="text-sm font-medium text-[var(--text-primary)]">파일을 놓아 카드로 추가</p>
        <p className="mt-1 text-[var(--font-2xs)] text-[var(--text-tertiary)]">.txt · .md 파일 · 여러 개 동시 가능</p>
      </div>
    </div>
  )
}
