import { describe, expect, it } from 'vitest'
import {
  buildDerivedFileName,
  buildLaunchPresetFileName,
  buildSettingsFileName,
  buildTempSettingsFileName,
  normalizePresetName,
  parseSettingsFileName,
} from '../../src/core/name.js'

describe('normalizePresetName', () => {
  it('normalizes names into safe lowercase file segments', () => {
    expect(normalizePresetName(' Work Profile ')).toBe('work-profile')
    expect(normalizePresetName('中文 preset')).toBe('preset')
    expect(normalizePresetName('../evil')).toBe('..-evil')
  })

  it('uses timestamp fallback when the input has no safe characters', () => {
    expect(normalizePresetName('中文')).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/)
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

describe('project launch preset file names', () => {
  it('builds normalized launch preset file names', () => {
    expect(buildLaunchPresetFileName('Web Dev')).toBe('web-dev-launch.json')
  })

  it('builds temp settings file names with a stable prefix', () => {
    const date = new Date('2026-05-19T08:07:06.000Z')
    expect(buildTempSettingsFileName(date)).toMatch(/^2026-05-19-\d{2}-\d{2}-\d{2}-settings\.json$/)
  })
})
