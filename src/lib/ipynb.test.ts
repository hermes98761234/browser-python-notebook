import { describe, expect, it } from 'vitest'
import { exportIpynb, fromLines, importIpynb, toLines } from './ipynb'
import { appendOutput, makeCell, makeNotebook, startRun } from './model'

describe('line arrays', () => {
  it('splits like Jupyter and joins back', () => {
    expect(toLines('a\nb\n')).toEqual(['a\n', 'b\n'])
    expect(toLines('a\nb')).toEqual(['a\n', 'b'])
    expect(toLines('')).toEqual([])
    expect(toLines('\n\n')).toEqual(['\n', '\n'])
    expect(fromLines(['a\n', 'b'])).toBe('a\nb')
    expect(fromLines('x')).toBe('x')
    expect(fromLines(undefined)).toBe('')
  })
})

describe('export', () => {
  it('writes nbformat 4 with line-array sources and outputs', () => {
    let nb = makeNotebook('demo', [makeCell('markdown', '# T\ntext'), makeCell('code', 'print(1)\nx = 2')])
    const id = nb.cells[1].id
    nb = startRun(nb, id, 3)
    nb = appendOutput(nb, id, { output_type: 'stream', name: 'stdout', text: '1\n' })
    nb = appendOutput(nb, id, { output_type: 'display_data', data: { 'image/png': 'AAAA', 'text/plain': '<Figure>' } })
    nb = appendOutput(nb, id, { output_type: 'execute_result', execution_count: 3, data: { 'text/html': '<b>x</b>\n<i>y</i>' } })
    nb = appendOutput(nb, id, { output_type: 'error', ename: 'ValueError', evalue: 'bad', traceback: ['tb'] })
    const j = JSON.parse(exportIpynb(nb))
    expect(j.nbformat).toBe(4)
    expect(j.nbformat_minor).toBeGreaterThanOrEqual(5)
    expect(j.metadata.kernelspec.language).toBe('python')
    expect(j.cells[0]).toMatchObject({ cell_type: 'markdown', source: ['# T\n', 'text'] })
    expect(j.cells[0].outputs).toBeUndefined()
    const code = j.cells[1]
    expect(code).toMatchObject({ cell_type: 'code', execution_count: 3, source: ['print(1)\n', 'x = 2'] })
    expect(code.id).toBe(id)
    expect(code.outputs[0]).toEqual({ output_type: 'stream', name: 'stdout', text: ['1\n'] })
    expect(code.outputs[1].data['image/png']).toBe('AAAA')
    expect(code.outputs[1].data['text/plain']).toEqual(['<Figure>'])
    expect(code.outputs[2]).toMatchObject({ output_type: 'execute_result', execution_count: 3 })
    expect(code.outputs[2].data['text/html']).toEqual(['<b>x</b>\n', '<i>y</i>'])
    expect(code.outputs[3]).toMatchObject({ output_type: 'error', ename: 'ValueError', traceback: ['tb'] })
    expect(code.outputs[1].metadata).toEqual({})
  })
})

describe('import', () => {
  const sample = {
    cells: [
      { cell_type: 'markdown', id: 'm1', metadata: {}, source: ['# Hi\n', 'there'] },
      {
        cell_type: 'code', id: 'k1', metadata: {}, execution_count: 7, source: 'x = 1\nx',
        outputs: [
          { output_type: 'stream', name: 'stderr', text: ['warn\n'] },
          { output_type: 'execute_result', execution_count: 7, data: { 'text/plain': ['1'], 'application/json': { a: 1 } }, metadata: {} },
          { output_type: 'error', ename: 'E', evalue: 'v', traceback: ['l1', 'l2'] },
          { output_type: 'mystery' },
        ],
      },
      { cell_type: 'raw', metadata: {}, source: ['raw text'] },
      { cell_type: 'code', id: 'k1', source: [], outputs: [], execution_count: null },
      'junk',
    ],
    metadata: { kernelspec: { name: 'python3', display_name: 'Py', language: 'python' }, custom: 5 },
    nbformat: 4,
    nbformat_minor: 4,
  }

  it('reads cells, outputs, counters and metadata', () => {
    const nb = importIpynb(JSON.stringify(sample), 'my.ipynb')
    expect(nb.name).toBe('my')
    expect(nb.cells).toHaveLength(4)
    expect(nb.cells[0]).toMatchObject({ id: 'm1', type: 'markdown', source: '# Hi\nthere' })
    const k = nb.cells[1]
    expect(k).toMatchObject({ id: 'k1', type: 'code', source: 'x = 1\nx', executionCount: 7 })
    expect(k.outputs).toHaveLength(3)
    expect(k.outputs[0]).toEqual({ output_type: 'stream', name: 'stderr', text: 'warn\n' })
    expect(k.outputs[1]).toMatchObject({ output_type: 'execute_result', execution_count: 7 })
    expect((k.outputs[1] as { data: Record<string, string> }).data['application/json']).toContain('"a": 1')
    expect(k.outputs[2]).toMatchObject({ output_type: 'error', traceback: ['l1', 'l2'] })
    expect(nb.cells[2]).toMatchObject({ type: 'markdown', source: 'raw text' })
    expect(nb.metadata.custom).toBe(5)
  })

  it('makes duplicate and missing ids unique', () => {
    const nb = importIpynb(JSON.stringify(sample))
    const ids = nb.cells.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    const old = importIpynb(JSON.stringify({ cells: [{ cell_type: 'code', source: 'a' }, { cell_type: 'code', source: 'b' }], nbformat: 4 }))
    expect(new Set(old.cells.map((c) => c.id)).size).toBe(2)
    expect(old.cells[0].outputs).toEqual([])
  })

  it('rejects things that are not nbformat 4 notebooks', () => {
    expect(() => importIpynb('nope')).toThrow(/JSON/)
    expect(() => importIpynb('{"a":1}')).toThrow(/cells/)
    expect(() => importIpynb('{"cells":[],"nbformat":3}')).toThrow(/nbformat 3/)
  })

  it('imports an empty notebook as one empty cell', () => {
    expect(importIpynb('{"cells":[],"nbformat":4}').cells).toHaveLength(1)
  })

  it('round-trips export -> import -> export', () => {
    let nb = makeNotebook('rt', [makeCell('markdown', '$x^2$ and\n\ntext\n'), makeCell('code', 'import numpy as np\nnp.arange(3)\n')])
    nb = startRun(nb, nb.cells[1].id, 2)
    nb = appendOutput(nb, nb.cells[1].id, { output_type: 'stream', name: 'stdout', text: 'a\nb' })
    nb = appendOutput(nb, nb.cells[1].id, { output_type: 'execute_result', execution_count: 2, data: { 'text/plain': 'array([0, 1, 2])' } })
    const a = exportIpynb(nb)
    const back = importIpynb(a, 'rt.ipynb')
    expect(back.cells).toEqual(nb.cells)
    expect(exportIpynb(back)).toBe(a)
  })
})
