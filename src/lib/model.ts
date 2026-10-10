// Notebook model: plain data plus pure functions (no React, no DOM).

export type CellType = 'code' | 'markdown'

export type Output =
  | { output_type: 'stream'; name: 'stdout' | 'stderr'; text: string }
  | { output_type: 'display_data'; data: MimeBundle }
  | { output_type: 'execute_result'; data: MimeBundle; execution_count: number | null }
  | { output_type: 'error'; ename: string; evalue: string; traceback: string[] }

/** MIME type -> text payload (image/png is base64). */
export type MimeBundle = Record<string, string>

export interface Cell {
  id: string
  type: CellType
  source: string
  outputs: Output[]
  executionCount: number | null
}

export interface Notebook {
  name: string
  cells: Cell[]
  /** Notebook-level metadata from an imported .ipynb, preserved on export. */
  metadata: Record<string, unknown>
}

let counter = 0
export function newId(): string {
  counter += 1
  const rnd = Math.random().toString(36).slice(2, 8)
  return `c${Date.now().toString(36)}${counter.toString(36)}${rnd}`
}

export function makeCell(type: CellType = 'code', source = ''): Cell {
  return { id: newId(), type, source, outputs: [], executionCount: null }
}

export function makeNotebook(name = 'Untitled', cells: Cell[] = [makeCell('code')]): Notebook {
  return { name, cells, metadata: {} }
}

const indexOf = (nb: Notebook, id: string) => nb.cells.findIndex((c) => c.id === id)

const withCells = (nb: Notebook, cells: Cell[]): Notebook => ({ ...nb, cells })

/** Inserts a new cell after `afterId` (or at the end / start when null / `'start'`). */
export function addCell(nb: Notebook, type: CellType, afterId: string | null, source = ''): { nb: Notebook; id: string } {
  const cell = makeCell(type, source)
  let at = nb.cells.length
  if (afterId === 'start') at = 0
  else if (afterId !== null) {
    const i = indexOf(nb, afterId)
    if (i >= 0) at = i + 1
  }
  const cells = [...nb.cells.slice(0, at), cell, ...nb.cells.slice(at)]
  return { nb: withCells(nb, cells), id: cell.id }
}

/** Inserts a cell before `beforeId`. */
export function addCellBefore(nb: Notebook, type: CellType, beforeId: string): { nb: Notebook; id: string } {
  const i = indexOf(nb, beforeId)
  return addCell(nb, type, i <= 0 ? 'start' : nb.cells[i - 1].id)
}

/** Deletes a cell. A notebook always keeps at least one cell. Returns the id to select next. */
export function deleteCell(nb: Notebook, id: string): { nb: Notebook; selected: string } {
  const i = indexOf(nb, id)
  if (i < 0) return { nb, selected: nb.cells[0].id }
  if (nb.cells.length === 1) {
    const fresh = makeCell('code')
    return { nb: withCells(nb, [fresh]), selected: fresh.id }
  }
  const cells = nb.cells.filter((c) => c.id !== id)
  return { nb: withCells(nb, cells), selected: cells[Math.min(i, cells.length - 1)].id }
}

export function moveCell(nb: Notebook, id: string, dir: -1 | 1): Notebook {
  const i = indexOf(nb, id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= nb.cells.length) return nb
  const cells = [...nb.cells]
  ;[cells[i], cells[j]] = [cells[j], cells[i]]
  return withCells(nb, cells)
}

function updateCell(nb: Notebook, id: string, f: (c: Cell) => Cell): Notebook {
  const i = indexOf(nb, id)
  if (i < 0) return nb
  const cells = [...nb.cells]
  cells[i] = f(cells[i])
  return withCells(nb, cells)
}

export function setSource(nb: Notebook, id: string, source: string): Notebook {
  return updateCell(nb, id, (c) => (c.source === source ? c : { ...c, source }))
}

export function setCellType(nb: Notebook, id: string, type: CellType): Notebook {
  return updateCell(nb, id, (c) => (c.type === type ? c : { ...c, type, outputs: [], executionCount: null }))
}

export function clearOutputs(nb: Notebook, id?: string): Notebook {
  const clear = (c: Cell): Cell => (c.outputs.length === 0 && c.executionCount === null ? c : { ...c, outputs: [], executionCount: null })
  if (id) return updateCell(nb, id, clear)
  return withCells(nb, nb.cells.map(clear))
}

/** Clears outputs and marks the cell as executed with the given counter (the start of a run). */
export function startRun(nb: Notebook, id: string, count: number): Notebook {
  return updateCell(nb, id, (c) => ({ ...c, outputs: [], executionCount: count }))
}

/** Appends an output; consecutive stream chunks with the same name are merged like Jupyter does. */
export function appendOutput(nb: Notebook, id: string, out: Output): Notebook {
  return updateCell(nb, id, (c) => {
    const last = c.outputs[c.outputs.length - 1]
    if (out.output_type === 'stream' && last?.output_type === 'stream' && last.name === out.name) {
      return { ...c, outputs: [...c.outputs.slice(0, -1), { ...last, text: last.text + out.text }] }
    }
    return { ...c, outputs: [...c.outputs, out] }
  })
}

export function nextExecutionCount(nb: Notebook): number {
  return nb.cells.reduce((m, c) => Math.max(m, c.executionCount ?? 0), 0) + 1
}

export function codeCellIds(nb: Notebook): string[] {
  return nb.cells.filter((c) => c.type === 'code' && c.source.trim() !== '').map((c) => c.id)
}

/** Ids from `fromId` (inclusive) to the end, code cells only. */
export function codeCellIdsFrom(nb: Notebook, fromId: string): string[] {
  const i = indexOf(nb, fromId)
  return nb.cells
    .slice(Math.max(i, 0))
    .filter((c) => c.type === 'code' && c.source.trim() !== '')
    .map((c) => c.id)
}

export function neighbour(nb: Notebook, id: string, dir: -1 | 1): string | null {
  const j = indexOf(nb, id) + dir
  return j >= 0 && j < nb.cells.length ? nb.cells[j].id : null
}
