// src/features/storage/fileSave.ts
//
// FSAA(File System Access API) + Blob 폴백 파일 저장 공용 헬퍼.
// export.ts의 saveToFile과 CardDetailEditor.tsx의 handleDownloadMd가 각자 FSAA 타입
// 선언과 Blob 폴백(append/revoke 타이밍)을 다르게 구현하고 있던 것을 하나로 통일한다
// (export.ts 쪽 — body.appendChild + requestAnimationFrame revoke — 을 기준으로 채택:
// 즉시 revoke는 일부 브라우저에서 다운로드가 시작되기 전에 URL이 무효화될 수 있다).

type FSAAWindow = Window & {
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

export interface SaveTextFileOptions {
  content: string
  fileName: string
  mimeType: string
  /** FSAA 피커에 표시할 파일 형식 설명 (예: 'Markdown') */
  description: string
  /** 확장자(점 포함, 예: '.md') */
  extension: string
}

/** FSAA 지원 브라우저는 저장 위치를 고를 수 있고, 미지원(Firefox/Safari)은 자동 다운로드로 폴백한다. */
export async function saveTextFile(opts: SaveTextFileOptions): Promise<void> {
  if ('showSaveFilePicker' in window) {
    const handle = await (window as FSAAWindow).showSaveFilePicker({
      suggestedName: opts.fileName,
      types: [{ description: opts.description, accept: { [opts.mimeType]: [opts.extension] } }],
      startIn: 'downloads',
    })
    const writable = await handle.createWritable()
    await writable.write(opts.content)
    await writable.close()
    return
  }

  const blob = new Blob([opts.content], { type: opts.mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = opts.fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  requestAnimationFrame(() => {
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  })
}
