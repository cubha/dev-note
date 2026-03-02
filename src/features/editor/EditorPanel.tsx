// src/features/editor/EditorPanel.tsx

import { useEffect, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { EditorView, keymap } from '@codemirror/view'
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
} from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { db } from '../../core/db'
import type { ItemType } from '../../core/db'
import { safeDecrypt, safeEncrypt } from '../../core/crypto'
import {
  activeTabAtom,
  openTabsAtom,
  tabStatesAtom,
  dirtyItemsAtom,
  cryptoKeyAtom,
} from '../../store/atoms'

// ─── 헬퍼 ──────────────────────────────────────────────────────

function getLangExtension(type: ItemType) {
  if (type === 'db') return sql()
  return json()
}

function buildExtensions(
  langCompartment: Compartment,
  langExt: Extension,
) {
  return [
    langCompartment.of(langExt),
    oneDark,
    syntaxHighlighting(defaultHighlightStyle),
    indentOnInput(),
    EditorView.lineWrapping,
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
  const prevTabRef = useRef<number | null>(null)
  const dirtyListenerRef = useRef<Extension | null>(null)

  const activeTab = useAtomValue(activeTabAtom)
  const openTabs = useAtomValue(openTabsAtom)
  const cryptoKey = useAtomValue(cryptoKeyAtom)
  const tabStates = useAtomValue(tabStatesAtom)
  const tabStatesRef = useRef(tabStates)
  const setTabStates = useSetAtom(tabStatesAtom)
  const setDirtyItems = useSetAtom(dirtyItemsAtom)

  const isEmpty = openTabs.length === 0 || activeTab === null

  useEffect(() => {
    tabStatesRef.current = tabStates
  }, [tabStates])

  useEffect(() => {
    if (!containerRef.current) return

    const compartment = langCompartment.current
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

    const view = new EditorView({
      state: EditorState.create({
        doc: '',
        extensions: [...buildExtensions(compartment, json()), dirtyListener],
      }),
      parent: containerRef.current,
    })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [setDirtyItems])

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
      view.setState(
        EditorState.create({
          doc: '',
          extensions: ext
            ? [...buildExtensions(langCompartment.current, json()), ext]
            : buildExtensions(langCompartment.current, json()),
        }),
      )
      return
    }

    const cached = tabStatesRef.current.get(activeTab)
    if (cached) {
      view.setState(cached)
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
      const newState = EditorState.create({
        doc: text,
        extensions: ext
          ? [...buildExtensions(langCompartment.current, langExt), ext]
          : buildExtensions(langCompartment.current, langExt),
      })
      setTabStates((prev) => {
        const next = new Map(prev)
        next.set(activeTab, newState)
        return next
      })
      view.setState(newState)
    })
  }, [activeTab, cryptoKey, setTabStates])

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

  return (
    <div className="relative flex h-full flex-col">
      {isEmpty && (
        <div className="flex flex-1 items-center justify-center text-sm text-[#858585]">
          항목을 선택하거나 새 항목을 만들어 시작하세요.
        </div>
      )}
      <div
        ref={containerRef}
        className="h-full w-full overflow-auto"
        style={{ display: isEmpty ? 'none' : undefined }}
      />
    </div>
  )
}
