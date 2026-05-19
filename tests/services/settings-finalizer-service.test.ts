import { describe, expect, it } from 'vitest'
import { finalizeSettings } from '../../src/services/settings-finalizer-service.js'

describe('finalizeSettings', () => {
  it('overlays launch toggles onto full base settings', () => {
    expect(finalizeSettings(
      {
        permissions: { allow: ['Bash(ls)'] },
        enabledPlugins: { old: true },
        skillOverrides: { oldSkill: 'off' },
        deniedMcpServers: [{ serverName: 'old-mcp' }],
      },
      {
        enabledPlugins: { alpha: false },
        skillOverrides: { personal: 'off' },
        deniedMcpServers: [{ serverName: 'github' }],
      },
    )).toEqual({
      permissions: { allow: ['Bash(ls)'] },
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })
  })

  it('omits empty toggle fields from finalized settings', () => {
    expect(finalizeSettings(
      { permissions: { allow: ['Read(*)'] } },
      { enabledPlugins: {}, skillOverrides: {}, deniedMcpServers: [] },
    )).toEqual({ permissions: { allow: ['Read(*)'] } })
  })
})
