// src/shared/hooks/useMarkdownHtml.ts
//
// marked + DOMPurify 마크다운 → HTML 변환 훅

import { useState, useEffect } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

export const useMarkdownHtml = (text: string): string => {
  const [html, setHtml] = useState('')
  useEffect(() => {
    if (!text) { setHtml(''); return }
    const result = marked.parse(text) as string
    setHtml(DOMPurify.sanitize(result))
  }, [text])
  return html
}
