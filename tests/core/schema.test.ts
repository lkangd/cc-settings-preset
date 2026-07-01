import { describe, expect, it } from 'vitest'
import {
  ccspConfigSchema,
  createEmptyLaunchPresetIndex,
  lastSettingsSchema,
  parseCcspConfig,
  parseLaunchPresetSettings,
  parseSettings,
  presetIndexSchema,
  sessionIndexSchema,
  settingsSchema,
} from '../../src/core/schema.js'

describe('settingsSchema', () => {
  it('accepts a loose Claude settings object with plugin and skill fields', () => {
    const parsed = settingsSchema.parse({
      model: 'claude-sonnet-4-6',
      enabledPlugins: {
        'superpowers@claude-plugins-official': true,
        'legacy-plugin': false,
      },
      skillOverrides: {
        'legacy-context': 'off',
        deploy: 'name-only',
      },
    })

    expect(parsed.enabledPlugins?.['superpowers@claude-plugins-official']).toBe(true)
    expect(parsed.skillOverrides?.deploy).toBe('name-only')
    expect(parsed.model).toBe('claude-sonnet-4-6')
  })

  it('rejects non-object settings files', () => {
    expect(() => settingsSchema.parse([])).toThrow()
    expect(() => settingsSchema.parse('bad')).toThrow()
  })

  it('rejects unsupported skill override values', () => {
    expect(() => settingsSchema.parse({ skillOverrides: { demo: 'disabled' } })).toThrow()
  })

  it('accepts denied MCP server policy entries in full settings', () => {
    expect(parseSettings({
      enabledPlugins: { alpha: true },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'filesystem' }],
      customField: { preserved: true },
    })).toEqual({
      enabledPlugins: { alpha: true },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'filesystem' }],
      customField: { preserved: true },
    })
  })
})


describe('launch preset schema', () => {
  it('stores only launch toggle settings', () => {
    expect(parseLaunchPresetSettings({
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })).toEqual({
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })
  })

  it('creates an empty launch preset index', () => {
    expect(createEmptyLaunchPresetIndex()).toEqual({ version: 1, presets: {} })
  })
})

describe('lastSettingsSchema', () => {
  it('parses a project-path keyed last-used preset map', () => {
    expect(
      lastSettingsSchema.parse({
        '/Users/liangkangda/Fe-project/code/cc-settings-preset': {
          presetName: 'work',
          updatedAt: '2026-05-20T08:00:00.000Z',
        },
      }),
    ).toEqual({
      '/Users/liangkangda/Fe-project/code/cc-settings-preset': {
        presetName: 'work',
        updatedAt: '2026-05-20T08:00:00.000Z',
      },
    })
  })
})

describe('ccspConfigSchema', () => {
  it('defaults optional preferences', () => {
    expect(parseCcspConfig({})).toEqual({
      globalPresetEnvOnly: true,
      statusLineEnabled: true,
      settingsDisplayFormat: 'yaml',
      runMode: 'both',
      bannerEnabled: true,
    })
  })

  it.each(['both', 'global-only', 'project-only'] as const)('accepts run mode %s', runMode => {
    expect(ccspConfigSchema.parse({ runMode }).runMode).toBe(runMode)
  })

  it('rejects invalid run modes', () => {
    expect(() => ccspConfigSchema.parse({ runMode: 'global' })).toThrow()
  })
})

describe('sessionIndexSchema', () => {
  it('accepts optional preset labels for session bindings', () => {
    expect(sessionIndexSchema.parse({
      version: 1,
      sessions: {
        'sess-a': {
          sessionId: 'sess-a',
          globalName: 'project-local',
          projectPresetName: 'web',
          presetLabel: 'web',
          baseSettings: {},
          launchSettings: {},
          toggles: { plugins: [], skills: [], mcps: [] },
          createdAt: '2026-05-20T00:00:00.000Z',
          lastUsedAt: '2026-05-20T00:00:00.000Z',
        },
      },
    }).sessions['sess-a']?.presetLabel).toBe('web')
  })

  it('keeps old session bindings valid without preset labels', () => {
    expect(sessionIndexSchema.parse({
      version: 1,
      sessions: {
        'sess-a': {
          sessionId: 'sess-a',
          globalName: 'work',
          projectPresetName: 'web',
          baseSettings: {},
          launchSettings: {},
          toggles: { plugins: [], skills: [], mcps: [] },
          createdAt: '2026-05-20T00:00:00.000Z',
          lastUsedAt: '2026-05-20T00:00:00.000Z',
        },
      },
    }).sessions['sess-a']?.presetLabel).toBeUndefined()
  })
})

describe('presetIndexSchema', () => {
  it('accepts first-level preset metadata', () => {
    const parsed = presetIndexSchema.parse({
      version: 1,
      presets: {
        base: {
          type: 'base',
          name: 'base',
          fileName: 'base-settings.json',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      },
    })

    expect(parsed.presets.base?.type).toBe('base')
  })
})
