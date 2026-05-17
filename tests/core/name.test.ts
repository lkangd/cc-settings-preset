import { describe, expect, it } from 'vitest'
import { buildDerivedFileName, buildSettingsFileName, normalizePresetName, parseSettingsFileName } from '../../src/core/name.js'

describe('normalizePresetName', () => {
  it('normalizes names into safe lowercase file segments', () => {
    expect(normalizePresetName(' Work Profile ')).toBe('work-profile')
    expect(normalizePresetName('中文 preset')).toBe('preset')
    expect(normalizePresetName('../evil')).toBe('evil')
  })

  it('uses fallback when the input has no safe characters', () => {
    expect(normalizePresetName('中文')).toMatch(/^preset-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/)
  })
})

describe('file names', () => {
  it('builds base and derived settings file names', () => {
    expect(buildSettingsFileName('base')).toBe('base-settings.json')
    expect(buildDerivedFileName('base', 'work')).toBe('base-work-settings.json')
  })

  it('parses settings file names', () => {
    expect(parseSettingsFileName('base-settings.json')).toEqual({ name: 'base' })
    expect(parseSettingsFileName('base-work-settings.json')).toEqual({ name: 'base-work' })
    expect(parseSettingsFileName('notes.json')).toBeUndefined()
  })
})
