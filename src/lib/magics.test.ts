import { describe, expect, it } from 'vitest'
import { prepareCode } from './magics'

describe('prepareCode', () => {
  it('turns %pip install into micropip calls', () => {
    const r = prepareCode('%pip install -q six "tabulate==0.9.0"\nprint(1)')
    expect(r.usesMicropip).toBe(true)
    expect(r.code).toBe(`await __import__('micropip').install(["six","tabulate==0.9.0"])\nprint(1)`)
  })
  it('handles !pip and indentation', () => {
    expect(prepareCode('  !pip install a').code).toBe(`  await __import__('micropip').install(["a"])`)
  })
  it('drops %matplotlib and leaves plain code alone', () => {
    expect(prepareCode('%matplotlib inline\nx = 1')).toEqual({ code: 'pass\nx = 1', usesMicropip: false })
    const src = 'a = "pip install x"\nprint(a)'
    expect(prepareCode(src)).toEqual({ code: src, usesMicropip: false })
  })
})
