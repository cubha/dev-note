// src/features/editor/EditorPanel.tsx

import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands'
import type { Extension } from '@codemirror/state'
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  indentOnInput,
  indentUnit,
} from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { db } from '../../core/db'
import type { AppConfig, ItemType } from '../../core/db'
import { safeDecrypt, safeEncrypt } from '../../core/crypto'
import {
  activeTabAtom,
  openTabsAtom,
  tabStatesAtom,
  dirtyItemsAtom,
  cryptoKeyAtom,
  appConfigAtom,
} from '../../store/atoms'

// ─── 헬퍼 ──────────────────────────────────────────────────────

function getLangExtension(type: ItemType) {
  if (type === 'db') return sql()
  return json()
}

/** wordWrap / lineNumbers 를 Compartment에 담을 extension 목록 생성 */
function buildConfigExt(config: AppConfig | null): Extension[] {
  const exts: Extension[] = []
  if (config?.wordWrap) exts.push(EditorView.lineWrapping)
  if (config?.showLineNumbers) exts.push(lineNumbers())
  exts.push(indentUnit.of('  '))
  return exts
}

/** 에디터 테마 extension — dark: oneDark, light: defaultHighlightStyle */
function buildThemeExt(theme: 'dark' | 'light'): Extension[] {
  if (theme === 'dark') return [oneDark]
  return [syntaxHighlighting(defaultHighlightStyle)]
}

function buildExtensions(
  langCompartment: Compartment,
  langExt: Extension,
  configCompartment: Compartment,
  configExt: Extension[],
  themeCompartment: Compartment,
  themeExt: Extension[],
) {
  return [
    langCompartment.of(langExt),
    configCompartment.of(configExt),
    themeCompartment.of(themeExt),
    indentOnInput(),
    history(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
  ]
}

// ─── EditorPanel ────────────────────────────────────────────────

export function EditorPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const langCompartment = useRef(new Compartment())
  const configCompartment = useRef(new Compartment())
  const themeCompartment = useRef(new Compartment())
  const prevTabRef = useRef<number | null>(null)
  const dirtyListenerRef = useRef<Extension | null>(null)

  const activeTab = useAtomValue(activeTabAtom)
  const openTabs = useAtomValue(openTabsAtom)
  const cryptoKey = useAtomValue(cryptoKeyAtom)
  const config = useAtomValue(appConfigAtom)
  const tabStates = useAtomValue(tabStatesAtom)
  const tabStatesRef = useRef(tabStates)
  // config 최신값을 effect 내부에서 항상 참조하기 위한 ref
  const configRef = useRef(config)
  const setTabStates = useSetAtom(tabStatesAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)

  const isEmpty = openTabs.length === 0 || activeTab === null

  useEffect(() => {
    tabStatesRef.current = tabStates
  }, [tabStates])

  useEffect(() => {
    configRef.current = config
  }, [config])

  // ─── 에디터 초기화 (마운트 시 1회) ──────────────────────────
  useEffect(() => {
    if (!containerRef.current) return

    const compartment = langCompartment.current
    const cfgCompartment = configCompartment.current
    const themeCmpt = themeCompartment.current
    const dirtyListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && prevTabRef.current !== null) {
        setDirtyItems((prev) => {
          const next = new Set(prev)
          next.add(prevTabRef.current!)
          return next
        })
      }
    })
    dirtyListenerRef.current = dirtyListener

    const cfg = configRef.current
    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [
          ...buildExtensions(
            compartment,
            json(),
            cfgCompartment,
            buildConfigExt(cfg),
            themeCmpt,
            buildThemeExt(cfg?.theme ?? 'dark'),
          ),
          dirtyListener,
        ],
      }),
      parent: containerRef.current,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [setDirtyItems])

  // ─── wordWrap / lineNumbers 동적 적용 ────────────────────────
  useEffect(() => {
    const view = viewRef.current
    if (!view || !config) return
    view.dispatch({
      effects: [
        configCompartment.current.reconfigure(buildConfigExt(config)),
        themeCompartment.current.reconfigure(buildThemeExt(config.theme)),
      ],
    })
  // config 전체를 deps에 포함 (ESLint exhaustive-deps 준수)
  }, [config])

  // ─── 탭 전환 ─────────────────────────────────────────────────
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    if (prevTabRef.current !== null) {
      setTabStates((prev) => {
        const next = new Map(prev)
        next.set(prevTabRef.current!, view.state)
        return next
      })
    }
    prevTabRef.current = activeTab

    if (activeTab === null) {
      const ext = dirtyListenerRef.current
      const cfg = configRef.current
      const newState = EditorState.create({
        doc: '',
        extensions: ext
          ? [
              ...buildExtensions(
                langCompartment.current,
                json(),
                configCompartment.current,
                buildConfigExt(cfg),
                themeCompartment.current,
                buildThemeExt(cfg?.theme ?? 'dark'),
              ),
              ext,
            ]
          : buildExtensions(
              langCompartment.current,
              json(),
              configCompartment.current,
              buildConfigExt(cfg),
              themeCompartment.current,
              buildThemeExt(cfg?.theme ?? 'dark'),
            ),
      })
      view.setState(newState)
      return
    }

    const cached = tabStatesRef.current.get(activeTab)
    if (cached) {
      view.setState(cached)
      // 캐시된 상태 복원 후 현재 설정 재적용
      const cfg = configRef.current
      view.dispatch({
        effects: [
          configCompartment.current.reconfigure(buildConfigExt(cfg)),
          themeCompartment.current.reconfigure(buildThemeExt(cfg?.theme ?? 'dark')),
        ],
      })
      return
    }

    void db.items.get(activeTab).then(async (item) => {
      if (!item || viewRef.current === null) return

      const text = await safeDecrypt(
        cryptoKey,
        item.encryptedContent,
        item.iv,
      )

      const view = viewRef.current
      if (!view || prevTabRef.current !== activeTab) return

      const langExt = getLangExtension(item.type)
      view.dispatch({
        effects: langCompartment.current.reconfigure(langExt),
      })
      const ext = dirtyListenerRef.current
      const cfg = configRef.current
      const newState = EditorState.create({
        doc: text,
        extensions: ext
          ? [
              ...buildExtensions(
                langCompartment.current,
                langExt,
                configCompartment.current,
                buildConfigExt(cfg),
                themeCompartment.current,
                buildThemeExt(cfg?.theme ?? 'dark'),
              ),
              ext,
            ]
          : buildExtensions(
              langCompartment.current,
              langExt,
              configCompartment.current,
              buildConfigExt(cfg),
              themeCompartment.current,
              buildThemeExt(cfg?.theme ?? 'dark'),
            ),
      })
      setTabStates((prev) => {
        const next = new Map(prev)
        next.set(activeTab, newState)
        return next
      })
      view.setState(newState)
    })
  }, [activeTab, cryptoKey, setTabStates])

  // ─── Ctrl+S 저장 ─────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 's') return
      e.preventDefault()

      const view = viewRef.current
      if (!view || activeTab === null) return

      const plaintext = view.state.doc.toString()
      const { encryptedContent, iv } = await safeEncrypt(cryptoKey, plaintext)

      await db.items.update(activeTab, {
        encryptedContent,
        iv,
        updatedAt: Date.now(),
      })

      setDirtyItems((prev) => {
        const next = new Set(prev)
        next.delete(activeTab)
        return next
      })
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, cryptoKey, setDirtyItems])

  // ─── 폰트 크기 적용 ─────────────────────────────────────────
  const fontSize = config?.editorFontSize ?? 14

  return (
    <div className="relative flex h-full flex-col">
      {isEmpty && (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-secondary)]">
          항목을 선택하거나 새 항목을 만들어 시작하세요.
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full overflow-auto"
        style={{
          display: isEmpty ? 'none' : undefined,
          fontSize: `${fontSize}px`,
        }}
      />
    </div>
  )
}
