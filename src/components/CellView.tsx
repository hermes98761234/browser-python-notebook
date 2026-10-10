import { memo, useMemo } from 'react'
import type { Cell, CellType } from '../lib/model'
import { renderMarkdown } from '../lib/markdown'
import { sanitizeHtml } from '../lib/sanitize'
import type { T } from '../i18n'
import Editor from './Editor'
import OutputView from './OutputView'

export type RunState = 'idle' | 'queued' | 'running'

export interface CellActions {
  select(id: string): void
  setSource(id: string, v: string): void
  setType(id: string, t: CellType): void
  run(id: string, how: 'next' | 'stay' | 'insert'): void
  move(id: string, dir: -1 | 1): void
  remove(id: string): void
  addBelow(id: string, t: CellType): void
  clearOutputs(id: string): void
  setEditing(id: string, v: boolean): void
  register(id: string, focus: (() => void) | null): void
}

interface Props {
  cell: Cell
  index: number
  selected: boolean
  editing: boolean
  runState: RunState
  actions: CellActions
  t: T
}

function Markdown({ source }: { source: string }) {
  const html = useMemo(() => sanitizeHtml(renderMarkdown(source)), [source])
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
}

function CellView({ cell, index, selected, editing, runState, actions, t }: Props) {
  const isCode = cell.type === 'code'
  const showEditor = isCode || editing || cell.source.trim() === ''
  const counter = runState === 'running' ? '*' : runState === 'queued' ? '…' : cell.executionCount === null ? ' ' : String(cell.executionCount)
  const n = index + 1

  return (
    <section className={`cell ${cell.type}${selected ? ' selected' : ''}${runState === 'running' ? ' running' : ''}`} onMouseDown={() => !selected && actions.select(cell.id)} aria-label={t('Cell {0}', n)}>
      <div className="gutter">
        {isCode ? (
          <>
            <button className="run" title={t('Run cell (Shift+Enter)')} aria-label={t('Run cell (Shift+Enter)')} onClick={() => actions.run(cell.id, 'stay')}>
              ▶
            </button>
            <span className="count" title={t('Execution count')}>[{counter}]</span>
          </>
        ) : (
          <span className="count md-tag">Md</span>
        )}
      </div>
      <div className="cell-main">
        {showEditor ? (
          <Editor
            value={cell.source}
            language={isCode ? 'python' : 'markdown'}
            label={isCode ? t('Code cell {0}', n) : t('Markdown cell {0}', n)}
            onChange={(v) => actions.setSource(cell.id, v)}
            onRun={() => actions.run(cell.id, 'next')}
            onRunStay={() => actions.run(cell.id, 'stay')}
            onRunInsert={() => actions.run(cell.id, 'insert')}
            onFocus={() => {
              actions.select(cell.id)
              if (!isCode) actions.setEditing(cell.id, true)
            }}
            register={(f) => actions.register(cell.id, f)}
          />
        ) : (
          <div className="md-view" onDoubleClick={() => actions.setEditing(cell.id, true)} title={t('Double-click to edit')}>
            <Markdown source={cell.source} />
          </div>
        )}
        {isCode && <OutputView outputs={cell.outputs} />}
      </div>
      <div className="cell-tools" role="toolbar" aria-label={t('Cell tools')}>
        {!isCode && editing && cell.source.trim() !== '' && (
          <button className="small" onClick={() => actions.setEditing(cell.id, false)}>
            {t('Render')}
          </button>
        )}
        <select
          className="small"
          value={cell.type}
          aria-label={t('Cell type')}
          onChange={(e) => actions.setType(cell.id, e.target.value as CellType)}
        >
          <option value="code">{t('Code')}</option>
          <option value="markdown">{t('Markdown')}</option>
        </select>
        <button className="small" title={t('Move up')} aria-label={t('Move up')} onClick={() => actions.move(cell.id, -1)}>↑</button>
        <button className="small" title={t('Move down')} aria-label={t('Move down')} onClick={() => actions.move(cell.id, 1)}>↓</button>
        <button className="small" title={t('Add code cell below')} aria-label={t('Add code cell below')} onClick={() => actions.addBelow(cell.id, 'code')}>+</button>
        {isCode && cell.outputs.length > 0 && (
          <button className="small" title={t('Clear output')} aria-label={t('Clear output')} onClick={() => actions.clearOutputs(cell.id)}>⌫</button>
        )}
        <button className="small danger" title={t('Delete cell')} aria-label={t('Delete cell')} onClick={() => actions.remove(cell.id)}>✕</button>
      </div>
    </section>
  )
}

export default memo(CellView)
