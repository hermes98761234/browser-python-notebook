import { describe, expect, it } from 'vitest'
import {
  addCell, addCellBefore, appendOutput, clearOutputs, codeCellIds, codeCellIdsFrom, deleteCell, makeCell, makeNotebook,
  moveCell, neighbour, nextExecutionCount, setCellType, setSource, startRun, type Notebook,
} from './model'

const three = (): Notebook => makeNotebook('t', [makeCell('code', 'a'), makeCell('markdown', 'b'), makeCell('code', 'c')])
const srcs = (nb: Notebook) => nb.cells.map((c) => c.source).join('')

describe('cell editing', () => {
  it('adds a cell after a given one, at the end, and at the start', () => {
    const nb = three()
    const a = addCell(nb, 'code', nb.cells[0].id, 'x')
    expect(srcs(a.nb)).toBe('axbc')
    expect(a.nb.cells[1].id).toBe(a.id)
    expect(srcs(addCell(nb, 'code', null, 'x').nb)).toBe('abcx')
    expect(srcs(addCell(nb, 'code', 'start', 'x').nb)).toBe('xabc')
    expect(srcs(addCellBefore(nb, 'code', nb.cells[2].id).nb)).toBe('ab' + '' + 'c')
    expect(addCellBefore(nb, 'markdown', nb.cells[2].id).nb.cells[2].type).toBe('markdown')
    expect(addCellBefore(nb, 'code', nb.cells[0].id).nb.cells[0].source).toBe('')
  })

  it('does not mutate the input', () => {
    const nb = three()
    moveCell(nb, nb.cells[0].id, 1)
    deleteCell(nb, nb.cells[0].id)
    expect(srcs(nb)).toBe('abc')
  })

  it('moves cells and ignores moves past the ends', () => {
    const nb = three()
    expect(srcs(moveCell(nb, nb.cells[0].id, 1))).toBe('bac')
    expect(srcs(moveCell(nb, nb.cells[2].id, -1))).toBe('acb')
    expect(moveCell(nb, nb.cells[0].id, -1)).toBe(nb)
    expect(moveCell(nb, nb.cells[2].id, 1)).toBe(nb)
    expect(moveCell(nb, 'nope', 1)).toBe(nb)
  })

  it('deletes cells, selects a neighbour, and keeps at least one cell', () => {
    const nb = three()
    const r = deleteCell(nb, nb.cells[1].id)
    expect(srcs(r.nb)).toBe('ac')
    expect(r.selected).toBe(nb.cells[2].id)
    const last = deleteCell(nb, nb.cells[2].id)
    expect(last.selected).toBe(nb.cells[1].id)
    const single = makeNotebook('s', [makeCell('code', 'only')])
    const e = deleteCell(single, single.cells[0].id)
    expect(e.nb.cells).toHaveLength(1)
    expect(e.nb.cells[0].source).toBe('')
    expect(e.selected).toBe(e.nb.cells[0].id)
  })

  it('sets source and cell type (type change drops outputs)', () => {
    let nb = three()
    const id = nb.cells[0].id
    nb = startRun(nb, id, 1)
    nb = appendOutput(nb, id, { output_type: 'stream', name: 'stdout', text: 'hi' })
    expect(setSource(nb, id, 'a').cells[0]).toBe(nb.cells[0])
    expect(setSource(nb, id, 'new').cells[0].source).toBe('new')
    const md = setCellType(nb, id, 'markdown').cells[0]
    expect(md.type).toBe('markdown')
    expect(md.outputs).toEqual([])
    expect(md.executionCount).toBeNull()
  })
})

describe('execution', () => {
  it('numbers runs and clears old outputs', () => {
    let nb = three()
    const id = nb.cells[0].id
    expect(nextExecutionCount(nb)).toBe(1)
    nb = startRun(nb, id, 1)
    nb = appendOutput(nb, id, { output_type: 'stream', name: 'stdout', text: 'x' })
    expect(nextExecutionCount(nb)).toBe(2)
    nb = startRun(nb, id, 5)
    expect(nb.cells[0].outputs).toEqual([])
    expect(nb.cells[0].executionCount).toBe(5)
    expect(nextExecutionCount(nb)).toBe(6)
  })

  it('merges consecutive stream chunks of the same stream only', () => {
    let nb = three()
    const id = nb.cells[0].id
    const s = (name: 'stdout' | 'stderr', text: string) => ({ output_type: 'stream' as const, name, text })
    nb = appendOutput(nb, id, s('stdout', 'a'))
    nb = appendOutput(nb, id, s('stdout', 'b\n'))
    nb = appendOutput(nb, id, s('stderr', 'e'))
    nb = appendOutput(nb, id, s('stdout', 'c'))
    expect(nb.cells[0].outputs.map((o) => (o.output_type === 'stream' ? o.name + ':' + o.text : '?'))).toEqual(['stdout:ab\n', 'stderr:e', 'stdout:c'])
    nb = appendOutput(nb, id, { output_type: 'display_data', data: { 'text/plain': 'd' } })
    nb = appendOutput(nb, id, s('stdout', 'z'))
    expect(nb.cells[0].outputs).toHaveLength(5)
  })

  it('clears outputs of one cell or all', () => {
    let nb = three()
    for (const c of nb.cells) nb = startRun(nb, c.id, 1)
    expect(clearOutputs(nb, nb.cells[0].id).cells.map((c) => c.executionCount)).toEqual([null, 1, 1])
    expect(clearOutputs(nb).cells.every((c) => c.executionCount === null)).toBe(true)
  })

  it('selects runnable cells', () => {
    const nb = makeNotebook('t', [makeCell('code', 'a'), makeCell('code', '  \n'), makeCell('markdown', 'm'), makeCell('code', 'd')])
    expect(codeCellIds(nb)).toEqual([nb.cells[0].id, nb.cells[3].id])
    expect(codeCellIdsFrom(nb, nb.cells[1].id)).toEqual([nb.cells[3].id])
    expect(neighbour(nb, nb.cells[0].id, 1)).toBe(nb.cells[1].id)
    expect(neighbour(nb, nb.cells[0].id, -1)).toBeNull()
    expect(neighbour(nb, nb.cells[3].id, 1)).toBeNull()
  })
})
