import { describe, expect, it } from 'vitest'
import { defaultSettings, parseSettings } from './settings'
import { parseDraft, serializeDraft } from './storage'

describe('settings', () => {
  it('picks the language from the browser and defaults the theme', () => {
    expect(defaultSettings('uk-UA')).toEqual({ lang: 'uk', theme: 'auto' })
    expect(defaultSettings('en-US')).toEqual({ lang: 'en', theme: 'auto' })
  })
  it('parses stored values and repairs invalid ones', () => {
    expect(parseSettings('{"lang":"uk","theme":"dark"}')).toEqual({ lang: 'uk', theme: 'dark' })
    expect(parseSettings('{"lang":"xx","theme":5}', 'uk')).toEqual({ lang: 'uk', theme: 'auto' })
    expect(parseSettings('not json')).toEqual({ lang: 'en', theme: 'auto' })
    expect(parseSettings(null)).toEqual({ lang: 'en', theme: 'auto' })
  })
})

describe('draft', () => {
  it('round-trips and rejects junk', () => {
    const d = { name: 'a', ipynb: '{"cells":[]}' }
    expect(parseDraft(serializeDraft(d))).toEqual(d)
    expect(parseDraft('{"name":1}')).toBeNull()
    expect(parseDraft('x')).toBeNull()
    expect(parseDraft(null)).toBeNull()
  })
})
