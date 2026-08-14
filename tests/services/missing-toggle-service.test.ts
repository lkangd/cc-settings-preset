import { describe, expect, it } from 'vitest'
import { collectMissingToggleNames, countMissingToggles } from '../../src/services/missing-toggle-service.js'

const detected = {
  plugins: [{ name: 'alpha' }],
  skills: [{ name: 'review' }],
  mcps: [{ name: 'github' }],
}

describe('collectMissingToggleNames', () => {
  it('names everything a preset refers to that the project cannot see', () => {
    expect(collectMissingToggleNames({
      enabledPlugins: { alpha: false, ghost: false },
      skillOverrides: { review: 'off', phantom: 'off' },
      deniedMcpServers: [{ serverName: 'github' }, { serverName: 'spectre' }],
    }, detected)).toEqual({
      plugins: ['ghost'],
      skills: ['phantom'],
      mcps: ['spectre'],
    })
  })

  it('finds nothing when the preset only names installed things', () => {
    expect(countMissingToggles(collectMissingToggleNames({
      enabledPlugins: { alpha: false },
      skillOverrides: { review: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    }, detected))).toBe(0)
  })

  it('ignores MCP policies that match by shape rather than by name', () => {
    expect(collectMissingToggleNames({
      deniedMcpServers: [{ serverUrl: 'https://example.test' }, { serverCommand: ['npx', 'thing'] }],
    }, detected).mcps).toEqual([])
  })

  it('treats an empty preset as missing nothing', () => {
    expect(countMissingToggles(collectMissingToggleNames({}, detected))).toBe(0)
  })
})
