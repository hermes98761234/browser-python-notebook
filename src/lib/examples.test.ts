import { describe, expect, it } from 'vitest'
import { EXAMPLES } from './examples'
import { exportIpynb, importIpynb } from './ipynb'

describe('examples', () => {
  it('has the required notebooks, each exporting to valid nbformat 4', () => {
    const keys = EXAMPLES.map((e) => e.key)
    expect(keys).toEqual(expect.arrayContaining(['numpy', 'signal', 'curvefit', 'pandas']))
    for (const e of EXAMPLES) {
      const nb = e.make()
      expect(nb.cells.some((c) => c.type === 'code')).toBe(true)
      const back = importIpynb(exportIpynb(nb), nb.name)
      expect(back.cells.map((c) => c.source)).toEqual(nb.cells.map((c) => c.source))
    }
  })
})
