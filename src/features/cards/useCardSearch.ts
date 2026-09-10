// src/features/cards/useCardSearch.ts
//
// 카드 전역 검색의 상태와 부수효과. 순수 로직은 core/cardSearch.ts가 갖고,
// 여기서는 DOM 조회·포커스·스크롤·CodeMirror 하이라이트 같은 "바깥세상"만 다룬다.
//
// 이 훅은 두 가지를 절대 하지 않는다 — 둘 다 실기에서 결함으로 드러났던 것들이다:
//   1. **렌더 단계에서 ref를 읽지 않는다.** getSections()는 DocumentEditor의 ref를 읽는데
//      그 ref는 자식의 useEffect에서 갱신되므로, 렌더 중에 읽으면 커밋 직후 한 스텝 낡는다.
//      targets는 state로 들고, 바꾸기는 이미 손에 든 정확한 값을 직접 setTargets 한다.
//   2. **DOM 위젯을 값으로 찾지 않는다.** 검색은 "같은 문자열이 여러 곳에 있다"가 기본
//      상황이라 값 동등성은 항상 첫 요소를 집는다. data-search-path로만 조회한다.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSetAtom } from 'jotai'
import { EditorView } from '@codemirror/view'
import { cardSearchActivePathAtom } from '../../store/atoms'
import { setSearchHighlight } from '../../shared/utils/editorExtensions'
import {
  flattenCard, collectMatches, applyReplaceOne, applyReplaceAll,
  writeBackSections, expandSection, nextMatchIndexFrom, fieldPath,
} from '../../core/cardSearch'
import type { SearchOptions, SearchTarget, SearchMatch, MatchCursor } from '../../core/cardSearch'
import type { AnySection } from '../../core/types'

const FIELD_PREFIX = fieldPath('')

/** 조건부 렌더 위젯이 스스로 펼쳐질 때까지 기다리는 최대 프레임 수 */
const REVEAL_RETRY_FRAMES = 3

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
  const [targets, setTargets] = useState<SearchTarget[]>([])
  /** 바꾸기 직후 "여기 다음"으로 이동해야 한다는 예약. 새 matches가 도착하면 소비된다 */
  const [pendingCursor, setPendingCursor] = useState<MatchCursor | null>(null)

  const buildTargets = useCallback((): SearchTarget[] => {
    const sections = getSections()
    if (sections) return flattenCard({ sections })
    const fields = getFields() ?? []
    return flattenCard({
      fields: Object.fromEntries(fields.map((f) => [f.key, f.value])),
      fieldTypes: Object.fromEntries(fields.map((f) => [f.key, f.type ?? 'text'])),
    })
  }, [getSections, getFields])

  useEffect(() => {
    setTargets(open ? buildTargets() : [])
  }, [open, buildTargets])

  /**
   * 검색이 열린 채로 사용자가 카드를 편집했을 때 타깃을 다시 만든다.
   * 이게 없으면 낡은 스냅샷이 그대로 되쓰여 **사용자의 편집이 조용히 되돌아간다** —
   * writeBackSections의 pick()은 byPath에 있는 path를 현재 섹션값보다 우선하기 때문이다.
   * DocumentEditor는 sectionsRef를 갱신하는 effect 다음에 이 신호를 쏘므로 ref가 신선하다.
   */
  const refreshTargets = useCallback(() => {
    if (!open) return
    setTargets(buildTargets())
  }, [open, buildTargets])

  const matches = useMemo(
    () => collectMatches(targets, query, options),
    [targets, query, options],
  )

  useEffect(() => {
    if (index >= matches.length) setIndex(0)
  }, [matches.length, index])

  // 조건부 렌더 위젯(미리보기 모드·MD변환 모드·접힌 메모)이 구독해 스스로 펼치는 신호.
  // 이들의 토글은 각 컴포넌트의 로컬 state라 검색기가 밖에서 열 수 없다.
  const setActivePath = useSetAtom(cardSearchActivePathAtom)
  useEffect(() => {
    setActivePath(open ? matches[index]?.path ?? null : null)
  }, [open, matches, index, setActivePath])

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

    const reveal = (attempt = 0) => {
      // path는 flattenCard가 만든 것과 같은 문자열이 DOM에 박혀 있다(sectionPath/fieldPath 단일 소스).
      // CSS.escape로 감싸지 않으면 nanoid에 없는 문자라도 형식이 바뀔 때 조용히 깨진다.
      const host = root.querySelector<HTMLElement>(`[data-search-path="${CSS.escape(target.path)}"]`)
      if (!host) {
        // 조건부 렌더 위젯은 cardSearchActivePathAtom을 보고 스스로 펼쳐진다(useRevealOnSearch).
        // 그쪽이 layout effect라 페인트 전에 반영되지만, 여유로 몇 프레임 더 본다.
        // **상한이 있는 이유**: 무한 재시도는 진짜 계약 위반(경로 누락)을 영원히 조용하게 만든다.
        if (attempt < REVEAL_RETRY_FRAMES) { requestAnimationFrame(() => reveal(attempt + 1)); return }
        // 계약 위반은 조용한 "포커스가 안 움직임"으로만 드러난다 — 개발 중에는 소리내게 한다.
        // (섹션 타입을 추가하고 data-search-path를 빠뜨리는 게 대표적 경로다)
        if (import.meta.env.DEV) console.warn('[cardSearch] data-search-path 없음:', target.path)
        return
      }

      // 어떤 위젯인지는 target.widget이 아니라 **DOM에서 판정**한다.
      // flattenCard의 분류는 데이터만 보고 하는 추정이라 실제 렌더와 어긋날 수 있다 —
      // 실측 사례: 정형 카드의 multiline 필드는 'cm'으로 분류되지만 StructuredFieldForm은
      // 평범한 textarea로 그린다(CodeMirror는 에디터 필드 하나뿐). 그 어긋남은 에러가 아니라
      // "포커스가 안 움직임"으로만 드러났다.
      const cmDom = host.classList.contains('cm-editor')
        ? host
        : host.querySelector<HTMLElement>('.cm-editor')
      const view = cmDom ? EditorView.findFromDOM(cmDom) : null
      if (view) {
        // 치환 직후엔 React가 CM에 새 값을 밀어넣기 전일 수 있다. 문서 길이를 넘는 선택을
        // 그대로 dispatch하면 CM이 RangeError로 죽으므로 클램프한다.
        const len = view.state.doc.length
        if (match.start > len) return
        view.focus()
        view.dispatch({
          selection: { anchor: match.start, head: Math.min(match.end, len) },
          scrollIntoView: true,
        })
        return
      }

      const el = host instanceof HTMLInputElement || host instanceof HTMLTextAreaElement
        ? host
        : host.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
      if (!el) {
        if (import.meta.env.DEV) console.warn('[cardSearch] 포커스 가능한 위젯 없음:', target.path)
        return
      }
      el.focus()
      el.setSelectionRange(match.start, Math.min(match.end, el.value.length))
      el.scrollIntoView({ block: 'nearest' })
    }

    // 접힌 섹션은 DOM 자체가 없다 — 먼저 펼치고 다음 프레임에 조회한다.
    // 접힘 여부는 targets의 스냅샷이 아니라 **현재 sections**에서 읽는다 — 검색을 연 뒤에
    // 사용자가 섹션을 접으면 스냅샷이 낡는다(실기에서 확인된 결함).
    const sections = getSections()
    const section = target.sectionId ? sections?.find((s) => s.id === target.sectionId) : undefined
    if (section?.collapsed && sections) {
      setSections(expandSection(sections, section.id))
      requestAnimationFrame(() => requestAnimationFrame(() => reveal()))
      return
    }
    requestAnimationFrame(() => reveal())
  }, [targets, containerRef, getSections, setSections])

  const goTo = useCallback((next: number) => {
    if (!matches.length) return
    const wrapped = (next + matches.length) % matches.length
    setIndex(wrapped)
    focusMatch(matches[wrapped])
  }, [matches, focusMatch])

  // 바꾸기가 예약한 커서를 새 matches가 도착한 시점에 소비한다.
  // 인덱스가 아니라 위치로 전진해야 두 경우가 동시에 맞는다:
  //   sc→cs  치환된 매치가 사라져 뒤가 당겨진다(같은 인덱스가 곧 다음 대상)
  //   sc→scc 치환 자리에 매치가 남는다(그 자리를 건너뛰어야 한다)
  useEffect(() => {
    if (!pendingCursor) return
    setPendingCursor(null)
    if (!matches.length) { setIndex(0); return }
    const next = nextMatchIndexFrom(matches, targets, pendingCursor)
    setIndex(next)
    focusMatch(matches[next])
  }, [pendingCursor, matches, targets, focusMatch])

  const commitTargets = useCallback((updated: SearchTarget[]) => {
    const sections = getSections()
    if (sections) {
      setSections(writeBackSections(sections, updated))
    } else {
      for (const t of updated) {
        if (t.path.startsWith(FIELD_PREFIX)) setFieldValue(t.path.slice(FIELD_PREFIX.length), t.text)
      }
    }
    // 방금 만든 정확한 값을 그대로 진실로 삼는다 — ref를 다시 읽지 않는다
    setTargets(updated)
  }, [getSections, setSections, setFieldValue])

  const replaceOne = useCallback(() => {
    const match = matches[index]
    if (!match) return
    commitTargets(applyReplaceOne(targets, match, replaceText))
    setPendingCursor({ path: match.path, offset: match.start + replaceText.length })
  }, [matches, index, targets, replaceText, commitTargets])

  const replaceAll = useCallback(() => {
    if (!matches.length) return
    commitTargets(applyReplaceAll(targets, matches, replaceText))
    setIndex(0)
  }, [matches, targets, replaceText, commitTargets])

  const close = useCallback(() => {
    setOpen(false)
    setPendingCursor(null)
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
    replaceOne, replaceAll, close, openPanel, refreshTargets,
  }
}
