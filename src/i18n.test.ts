import { describe, expect, it } from 'vitest'
import { tr, UK } from './i18n'

describe('tr', () => {
  it('returns the source string for English and interpolates', () => {
    expect(tr('en', 'Cell {0}', 3)).toBe('Cell 3')
    expect(tr('en', 'Unknown thing')).toBe('Unknown thing')
  })
  it('translates to Ukrainian, falling back to English', () => {
    expect(tr('uk', 'Run all')).toBe('Запустити все')
    expect(tr('uk', 'Cell {0}', 2)).toBe('Комірка 2')
    expect(tr('uk', 'No translation here')).toBe('No translation here')
  })
  it('keeps placeholders consistent between languages', () => {
    for (const [en, uk] of Object.entries(UK)) {
      expect(uk.match(/\{\d+\}/g)?.sort()).toEqual(en.match(/\{\d+\}/g)?.sort())
    }
  })
})
