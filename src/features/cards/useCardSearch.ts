// src/features/cards/useCardSearch.ts
//
// 카드 전역 검색의 상태와 부수효과. 순수 로직은 core/cardSearch.ts가 갖고,
// 여기서는 DOM 조회·포커스·스크롤·CodeMirror 하이라이트 같은 "바깥세상"만 다룬다.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { setSearchHighlight } from '../../shared/utils/editorExtensions'
import {
  flattenCard, collectMatches, applyReplaceOne, applyReplaceAll,
  writeBackSections, expandSection,
} from '../../core/cardSearch'
import type { SearchOptions, SearchTarget, SearchMatch } from '../../core/cardSearch'
import type { AnySection } from '../../core/types'

interface UseCardSearchArgs {
  /** 카드 상세 루트 — 위젯 조회 범위를 이 안으로 한정한다 */
  containerRef: React.RefObject<HTMLElement | null>
  getSections: () => AnySection[] | undefined
  setSections: (next: AnySection[]) => void
  getFields: () => { key: string; value: string; type?: string }[] | undefined
  setFieldValue: (key: string, value: string) => void
}

export const useCardSearch = ({
  containerRef, getSections, setSections, getFields, setFieldValue,
}: UseCardSearchArgs) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [options, setOptions] = useState<SearchOptions>({})
  const [index, setIndex] = useState(0)
  /** 카드 내용이 바뀌면 타깃을 다시 펼치기 위한 신호 */
  const [revision, setRevision] = useState(0)

  const targets: SearchTarget[] = useMemo(() => {
    if (!open) return []
    const sections = getSections()
    if (sections) return flattenCard({ sections })
    const fields = getFields() ?? []
    return flattenCard({
      fields: Object.fromEntries(fields.map((f) => [f.key, f.value])),
      fieldTypes: Object.fromEntries(fields.map((f) => [f.key, f.type ?? 'text'])),
    })
    // revision이 바뀌면(바꾸기 적용 등) 타깃을 다시 만든다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, revision, getSections, getFields])

  const matches = useMemo(
    () => collectMatches(targets, query, options),
    [targets, query, options],
  )

  useEffect(() => {
    if (index >= matches.length) setIndex(0)
  }, [matches.length, index])

  /** 컨테이너 안의 모든 CodeMirror 인스턴스 */
  const codeMirrors = useCallback((): EditorView[] => {
    const root = containerRef.current
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLElement>('.cm-editor'))
      .map((dom) => EditorView.findFromDOM(dom))
      .filter((v): v is EditorView => !!v)
  }, [containerRef])

  // CodeMirror는 쿼리만 받으면 전체 매치 하이라이트를 스스로 그린다.
  // 비-CM 위젯(input/textarea)은 내부에 마크업을 넣을 수 없어 현재 매치만 네이티브 선택으로 표시한다.
  useEffect(() => {
    if (!open) return
    for (const view of codeMirrors()) {
      view.dispatch({ effects: setSearchHighlight.of({ query, options }) })
    }
  }, [open, query, options, codeMirrors])

  /** 매치가 있는 위젯을 찾아 포커스·선택하고 화면에 보이게 한다 */
  const focusMatch = useCallback((match: SearchMatch) => {
    const target = targets.find((t) => t.path === match.path)
    const root = containerRef.current
    if (!target || !root) return

    const reveal = () => {
      // 섹션 범위로 좁혀 조회 — 같은 값이 다른 섹션에 있어도 엉뚱한 곳으로 가지 않는다
      const scope = target.sectionId
        ? root.querySelector<HTMLElement>(`[data-section-id="${target.sectionId}"]`) ?? root
        : root

      if (target.widget === 'cm') {
        const view = Array.from(scope.querySelectorAll<HTMLElement>('.cm-editor'))
          .map((dom) => EditorView.findFromDOM(dom))
          .find((v): v is EditorView => !!v && v.state.doc.toString() === target.text)
        if (!view) return
        view.focus()
        view.dispatch({ selection: { anchor: match.start, head: match.end }, scrollIntoView: true })
        return
      }

      const el = Array.from(scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
        .find((n) => n.value === target.text)
      if (!el) return
      el.focus()
      el.setSelectionRange(match.start, match.end)
      el.scrollIntoView({ block: 'nearest' })
    }

    // 접힌 섹션은 DOM 자체가 없다 — 먼저 펼치고 다음 프레임에 조회한다.
    // 접힘 여부는 targets의 스냅샷이 아니라 **현재 sections**에서 읽는다 — targets는 메모이제이션돼
    // 있어서, 검색을 연 뒤에 사용자가 섹션을 접으면 스냅샷이 낡는다(실기에서 확인된 결함).
    const sections = getSections()
    const section = target.sectionId ? sections?.find((s) => s.id === target.sectionId) : undefined
    if (section?.collapsed && sections) {
      setSections(expandSection(sections, section.id))
      requestAnimationFrame(() => requestAnimationFrame(reveal))
      return
    }
    requestAnimationFrame(reveal)
  }, [targets, containerRef, getSections, setSections])

  const goTo = useCallback((next: number) => {
    if (!matches.length) return
    const wrapped = (next + matches.length) % matches.length
    setIndex(wrapped)
    focusMatch(matches[wrapped])
  }, [matches, focusMatch])

  const commitTargets = useCallback((updated: SearchTarget[]) => {
    const sections = getSections()
    if (sections) {
      setSections(writeBackSections(sections, updated))
    } else {
      for (const t of updated) {
        if (t.path.startsWith('field:')) setFieldValue(t.path.slice('field:'.length), t.text)
      }
    }
    setRevision((r) => r + 1)
  }, [getSections, setSections, setFieldValue])

  const replaceOne = useCallback(() => {
    const match = matches[index]
    if (!match) return
    commitTargets(applyReplaceOne(targets, match, replaceText))
  }, [matches, index, targets, replaceText, commitTargets])

  const replaceAll = useCallback(() => {
    if (!matches.length) return
    commitTargets(applyReplaceAll(targets, matches, replaceText))
  }, [matches, targets, replaceText, commitTargets])

  const close = useCallback(() => {
    setOpen(false)
    // CM 하이라이트 정리
    for (const view of codeMirrors()) view.dispatch({ effects: setSearchHighlight.of(null) })
  }, [codeMirrors])

  const openPanel = useCallback((withReplace: boolean) => {
    setReplaceOpen(withReplace)
    setOpen(true)
  }, [])

  return {
    open, query, replaceText, options, replaceOpen,
    matchCount: matches.length, currentIndex: index,
    setQuery, setReplaceText, setOptions,
    toggleReplace: () => setReplaceOpen((v) => !v),
    next: () => goTo(index + 1),
    prev: () => goTo(index - 1),
    replaceOne, replaceAll, close, openPanel,
  }
}
