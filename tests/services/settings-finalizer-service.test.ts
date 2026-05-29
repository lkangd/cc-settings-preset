import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  finalizeLaunchSettings,
  finalizeSettings,
  resolveProjectPresetName,
} from '../../src/services/settings-finalizer-service.js'

const resolveEffectiveStatusLineMock = vi.hoisted(() => vi.fn())
const injectCcspStatusLineMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/services/statusline-resolver-service.js', () => ({
  resolveEffectiveStatusLine: resolveEffectiveStatusLineMock,
}))

vi.mock('../../src/services/statusline-injector-service.js', () => ({
  injectCcspStatusLine: injectCcspStatusLineMock,
}))

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

describe('resolveProjectPresetName', () => {
  it('uses saveAs, then presetName, then Detected', () => {
    expect(resolveProjectPresetName({ type: 'launch', saveAs: 'saved' })).toBe('saved')
    expect(resolveProjectPresetName({ type: 'launch', presetName: 'web' })).toBe('web')
    expect(resolveProjectPresetName({ type: 'temp-launch' })).toBe('Detected')
    expect(resolveProjectPresetName({ type: 'back' })).toBe('Detected')
  })
})

describe('finalizeLaunchSettings', () => {
  beforeEach(() => {
    resolveEffectiveStatusLineMock.mockReset()
    injectCcspStatusLineMock.mockReset()
    resolveEffectiveStatusLineMock.mockResolvedValue(undefined)
    injectCcspStatusLineMock.mockImplementation(async ({ settings }) => ({
      ...settings,
      statusLine: { type: 'command', command: '/tmp/wrapper.sh' },
    }))
  })

  it('resolves statusLine sources and injects ccsp metadata', async () => {
    const claudeSources = [
      { scope: 'user' as const, filePath: '/tmp/settings.json', settings: {} },
    ]
    const toggles = { plugins: [], skills: [], mcps: [] }

    await finalizeLaunchSettings(
      { permissions: { allow: ['Read(*)'] } },
      { enabledPlugins: { alpha: false } },
      {
        globalName: 'work',
        projectPresetName: 'Detected',
        toggles,
        context: { homeDir: '/tmp/home', cwd: '/tmp/project' },
        claudeSources,
        stem: 'session-stem',
        statusLineEnabled: true,
      },
    )

    expect(resolveEffectiveStatusLineMock).toHaveBeenCalledWith({
      claudeSources,
      baseSettings: { permissions: { allow: ['Read(*)'] } },
    })
    expect(injectCcspStatusLineMock).toHaveBeenCalledWith(expect.objectContaining({
      meta: {
        globalName: 'work',
        projectPresetName: 'Detected',
        toggles,
      },
    }))
  })

  it('skips statusLine resolution and injection when disabled', async () => {
    const toggles = { plugins: [], skills: [], mcps: [] }

    const result = await finalizeLaunchSettings(
      { permissions: { allow: ['Read(*)'] } },
      { enabledPlugins: { alpha: false } },
      {
        globalName: 'work',
        projectPresetName: 'Detected',
        toggles,
        context: { homeDir: '/tmp/home', cwd: '/tmp/project' },
        claudeSources: [],
        stem: 'session-stem',
        statusLineEnabled: false,
      },
    )

    expect(resolveEffectiveStatusLineMock).not.toHaveBeenCalled()
    expect(injectCcspStatusLineMock).not.toHaveBeenCalled()
    expect(result).not.toHaveProperty('statusLine')
    expect(result).toEqual({
      permissions: { allow: ['Read(*)'] },
      enabledPlugins: { alpha: false },
    })
  })
})
