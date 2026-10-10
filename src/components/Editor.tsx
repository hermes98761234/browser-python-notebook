import { useEffect, useRef } from 'react'
import { EditorState, Prec } from '@codemirror/state'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { python } from '@codemirror/lang-python'
import { markdown } from '@codemirror/lang-markdown'
import { tags as t } from '@lezer/highlight'

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)], color: 'var(--syn-func)' },
  { tag: [t.className, t.typeName], color: 'var(--syn-class)' },
  { tag: [t.self, t.standard(t.variableName)], color: 'var(--syn-builtin)' },
  { tag: [t.heading, t.strong], color: 'var(--syn-func)', fontWeight: 'bold' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.link, t.url], color: 'var(--syn-string)', textDecoration: 'underline' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--syn-comment)' },
])

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--editor-bg)', color: 'var(--fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': { caretColor: 'var(--fg)', fontFamily: 'var(--mono)', padding: '6px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--fg)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-line': { padding: '0 8px' },
  '.cm-scroller': { fontFamily: 'var(--mono)', fontSize: '13px', lineHeight: '1.5' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--selection)' },
})

export interface EditorProps {
  value: string
  language: 'python' | 'markdown'
  onChange(v: string): void
  /** Shift+Enter */
  onRun(): void
  /** Ctrl/Cmd+Enter */
  onRunStay(): void
  /** Alt+Enter */
  onRunInsert(): void
  onFocus(): void
  register(focus: (() => void) | null): void
  label: string
}

export default function Editor(props: EditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef(props)
  useEffect(() => {
    latest.current = props
  })

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          EditorState.tabSize.of(4),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': latest.current.label }),
          latest.current.language === 'python' ? python() : markdown(),
          syntaxHighlighting(highlight),
          theme,
          Prec.highest(
            keymap.of([
              { key: 'Shift-Enter', run: () => (latest.current.onRun(), true) },
              { key: 'Mod-Enter', run: () => (latest.current.onRunStay(), true) },
              { key: 'Alt-Enter', run: () => (latest.current.onRunInsert(), true) },
            ]),
          ),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab, { key: 'Escape', run: (v) => (v.contentDOM.blur(), true) }]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString())
            if (u.focusChanged && u.view.hasFocus) latest.current.onFocus()
          }),
        ],
      }),
    })
    latest.current.register(() => view.focus())
    return () => {
      latest.current.register(null)
      view.destroy()
    }
  }, [])

  return <div className="editor" ref={host} />
}
