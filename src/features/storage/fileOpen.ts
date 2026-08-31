// src/features/storage/fileOpen.ts
//
// 단일 텍스트 파일(txt/md) 선택 헬퍼 — FSAA(showOpenFilePicker) + <input type=file> 폴백.
// import.ts의 importFromFile()(JSON 전용)과 구조가 겹치지만 의도적으로 분리한다:
// readFromInput의 취소 감지(window focus + setTimeout 휴리스틱)는 타이밍 의존이라
// 일반화하다 깨지면 이미 검증된 JSON 백업 복원 경로에 리스크가 번진다.

import { MAX_IMPORT_FILE_BYTES } from '../../core/importCard'

type FSAAOpenWindow = Window & {
  showOpenFilePicker: (opts: {
    types?: Array<{ description: string; accept: Record<string, string[]> }>
    multiple?: boolean
    excludeAcceptAllOption?: boolean
  }) => Promise<[{ getFile: () => Promise<File> }]>
}

export interface OpenedTextFile {
  name: string
  text: string
}

function assertSizeOk(file: File): void {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('파일이 너무 큽니다 (최대 5MB)')
  }
}

async function readFromInput(): Promise<OpenedTextFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.txt,.md,text/plain,text/markdown'
    input.style.display = 'none'
    document.body.appendChild(input)

    input.onchange = () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) {
        reject(new DOMException('파일이 선택되지 않았습니다', 'AbortError'))
        return
      }
      try {
        assertSizeOk(file)
      } catch (err) {
        reject(err)
        return
      }
      file.text().then((text) => resolve({ name: file.name, text })).catch(reject)
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

export async function openTextFile(): Promise<OpenedTextFile> {
  if ('showOpenFilePicker' in window) {
    const fsaaWindow = window as FSAAOpenWindow
    const [handle] = await fsaaWindow.showOpenFilePicker({
      types: [{
        description: '텍스트 · 마크다운',
        accept: { 'text/plain': ['.txt'], 'text/markdown': ['.md'] },
      }],
      multiple: false,
    })
    const file = await handle.getFile()
    assertSizeOk(file)
    return { name: file.name, text: await file.text() }
  } else {
    return readFromInput()
  }
}
