// Jupyter notebook (nbformat 4) import / export.
import { makeCell, makeNotebook, newId, type Cell, type MimeBundle, type Notebook, type Output } from './model'

type Json = Record<string, unknown>

export const NBFORMAT = 4
export const NBFORMAT_MINOR = 5

const DEFAULT_METADATA = {
  kernelspec: { display_name: 'Python 3 (Pyodide)', language: 'python', name: 'python3' },
  language_info: { name: 'python' },
}

/** Splits text into the line array Jupyter writes: every line keeps its trailing "\n". */
export function toLines(text: string): string[] {
  return text === '' ? [] : text.split(/(?<=\n)/)
}

/** Multiline strings in .ipynb files are either a string or an array of strings. */
export function fromLines(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((x) => String(x)).join('')
  return ''
}

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

// MIME types whose payload Jupyter stores as a line array (text) rather than one string (binary / JSON).
const isTextMime = (m: string) => m.startsWith('text/') || m === 'image/svg+xml' || m === 'application/javascript'

function outputToJson(o: Output): Json {
  switch (o.output_type) {
    case 'stream':
      return { output_type: 'stream', name: o.name, text: toLines(o.text) }
    case 'error':
      return { output_type: 'error', ename: o.ename, evalue: o.evalue, traceback: o.traceback }
    case 'display_data':
      return { output_type: 'display_data', data: bundleToJson(o.data), metadata: {} }
    case 'execute_result':
      return { output_type: 'execute_result', execution_count: o.execution_count, data: bundleToJson(o.data), metadata: {} }
  }
}

function bundleToJson(b: MimeBundle): Json {
  const out: Json = {}
  for (const [mime, v] of Object.entries(b)) out[mime] = isTextMime(mime) ? toLines(v) : v
  return out
}

function cellToJson(c: Cell): Json {
  if (c.type === 'markdown') return { id: c.id, cell_type: 'markdown', metadata: {}, source: toLines(c.source) }
  return {
    id: c.id,
    cell_type: 'code',
    metadata: {},
    execution_count: c.executionCount,
    source: toLines(c.source),
    outputs: c.outputs.map(outputToJson),
  }
}

export function notebookToJson(nb: Notebook): Json {
  return {
    cells: nb.cells.map(cellToJson),
    metadata: { ...DEFAULT_METADATA, ...nb.metadata },
    nbformat: NBFORMAT,
    nbformat_minor: NBFORMAT_MINOR,
  }
}

export function exportIpynb(nb: Notebook): string {
  return JSON.stringify(notebookToJson(nb), null, 1) + '\n'
}

function bundleFromJson(v: unknown): MimeBundle {
  const out: MimeBundle = {}
  if (!isObj(v)) return out
  for (const [mime, val] of Object.entries(v)) {
    if (typeof val === 'string' || Array.isArray(val)) out[mime] = fromLines(val)
    else if (val !== null && val !== undefined) out[mime] = JSON.stringify(val, null, 2)
  }
  return out
}

function outputFromJson(v: unknown): Output | null {
  if (!isObj(v)) return null
  switch (v.output_type) {
    case 'stream':
      return { output_type: 'stream', name: v.name === 'stderr' ? 'stderr' : 'stdout', text: fromLines(v.text) }
    case 'error':
      return {
        output_type: 'error',
        ename: String(v.ename ?? 'Error'),
        evalue: String(v.evalue ?? ''),
        traceback: Array.isArray(v.traceback) ? v.traceback.map(String) : [],
      }
    case 'display_data':
      return { output_type: 'display_data', data: bundleFromJson(v.data) }
    case 'execute_result':
      return {
        output_type: 'execute_result',
        data: bundleFromJson(v.data),
        execution_count: typeof v.execution_count === 'number' ? v.execution_count : null,
      }
    default:
      return null
  }
}

function cellFromJson(v: unknown, seen: Set<string>): Cell | null {
  if (!isObj(v)) return null
  const type = v.cell_type
  if (type !== 'code' && type !== 'markdown' && type !== 'raw') return null
  const cell = makeCell(type === 'code' ? 'code' : 'markdown', fromLines(v.source))
  // Cell ids must be unique; imported ones are kept when they are.
  let id = typeof v.id === 'string' && v.id !== '' ? v.id : cell.id
  if (seen.has(id)) id = newId()
  seen.add(id)
  cell.id = id
  if (type === 'code') {
    cell.executionCount = typeof v.execution_count === 'number' ? v.execution_count : null
    cell.outputs = Array.isArray(v.outputs) ? v.outputs.map(outputFromJson).filter((o): o is Output => o !== null) : []
  }
  return cell
}

/**
 * Parses an .ipynb file. Throws an Error with a readable message when the file is not a
 * nbformat 4 notebook. Raw cells are imported as Markdown cells.
 */
export function importIpynb(text: string, name = 'Untitled'): Notebook {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Not a valid JSON file')
  }
  if (!isObj(raw) || !Array.isArray(raw.cells)) throw new Error('Not a Jupyter notebook (no "cells")')
  const major = typeof raw.nbformat === 'number' ? raw.nbformat : 0
  if (major < 4) throw new Error(`Unsupported notebook format (nbformat ${major || 'unknown'}); only nbformat 4 is supported`)
  const seen = new Set<string>()
  const cells = raw.cells.map((c) => cellFromJson(c, seen)).filter((c): c is Cell => c !== null)
  const nb = makeNotebook(name.replace(/\.ipynb$/i, '') || 'Untitled', cells.length > 0 ? cells : [makeCell('code')])
  if (isObj(raw.metadata)) nb.metadata = raw.metadata
  return nb
}
