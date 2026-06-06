import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listPresetsMock = vi.fn()
const readPresetSettingsMock = vi.fn()
const getPresetPathMock = vi.fn()
const readIndexMock = vi.fn()
const buildClaudeOfficialItemMock = vi.fn()
const readLastUsedGlobalSettingsMock = vi.fn()
const writeLastUsedGlobalSettingsMock = vi.fn()
const listLaunchPresetsMock = vi.fn()
const readLaunchPresetSettingsMock = vi.fn()
const writeLastUsedLaunchPresetMock = vi.fn()
const writeTempSettingsMock = vi.fn().mockResolvedValue('/tmp/project/.claude/.ccsp/tmp/temp-settings.json')
const cleanupTempScriptsMock = vi.fn().mockResolvedValue(undefined)
const writeSessionBindingMock = vi.fn().mockResolvedValue(undefined)
const recordSessionExitMock = vi.fn().mockResolvedValue(undefined)
const discoverSettingsSourcesMock = vi.fn().mockResolvedValue([])
const discoverMcpStatesMock = vi.fn().mockResolvedValue([])
const spawnClaudeMock = vi.fn().mockResolvedValue(0)
const renderMock = vi.fn()

const basePreset = {
  type: 'base' as const,
  name: 'work',
  fileName: 'work-settings.json',
  createdAt: '2026-05-17T00:00:00.000Z',
  updatedAt: '2026-05-17T00:00:00.000Z',
}

const selectedSettings = {
  name: 'work',
  sourcePath: '/tmp/.ccsp/settings/work-settings.json',
  settings: { permissions: { allow: ['Read(*)'] } },
}

function unwrapRenderedElement(element: unknown): unknown {
  if (!React.isValidElement(element)) return element

  const props = element.props as Record<string, unknown>
  if ('global' in props || 'items' in props || 'presets' in props) return element

  const child = props.children
  if (Array.isArray(child)) {
    for (const item of child) {
      const unwrapped = unwrapRenderedElement(item)
      if (React.isValidElement(unwrapped)) {
        const unwrappedProps = unwrapped.props as Record<string, unknown>
        if ('global' in unwrappedProps || 'items' in unwrappedProps || 'presets' in unwrappedProps) {
          return unwrapped
        }
      }
    }
  }

  if (React.isValidElement(child)) return unwrapRenderedElement(child)
  return element
}

vi.mock('ink', () => ({
  Text: ({ children }: { children?: React.ReactNode }) => children,
  Box: ({ children }: { children?: React.ReactNode }) => children,
  render: (element: unknown) => renderMock(unwrapRenderedElement(element)),
}))

vi.mock('../src/core/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../src/core/paths.js')>('../src/core/paths.js')
  return {
    ...actual,
    createPathContext: () => ({ homeDir: '/tmp/home', cwd: '/tmp/project' }),
    resolveGlobalRoot: () => '/tmp/.ccsp',
    resolveUserClaudeSettingsPath: () => '/tmp/home/.claude/settings.json',
  }
})

vi.mock('../src/services/preset-service.js', () => ({
  CLAUDE_OFFICIAL_PRESET_NAME: '*Claude Official*',
  createPresetService: () => ({
    listPresets: listPresetsMock,
    readIndex: readIndexMock,
    getPresetPath: getPresetPathMock,
    readPresetSettings: readPresetSettingsMock,
    buildClaudeOfficialItem: buildClaudeOfficialItemMock,
  }),
}))

vi.mock('../src/services/settings-source-service.js', () => ({
  createSettingsSourceService: () => ({
    discoverSettingsSources: discoverSettingsSourcesMock,
  }),
}))

vi.mock('../src/core/spawn.js', () => ({
  spawnClaude: spawnClaudeMock,
}))

vi.mock('../src/services/plugin-service.js', () => ({
  applyPluginOverrides: vi.fn((plugins) => plugins),
  resolvePluginStates: vi.fn(() => []),
  pluginStatesToEnabledPlugins: vi.fn(() => ({})),
}))

vi.mock('../src/services/skill-service.js', () => ({
  applySkillOverrides: vi.fn((skills) => skills),
  discoverSkillStates: vi.fn().mockResolvedValue([]),
  resolveSkillOverrides: vi.fn(() => ({})),
  skillStatesToOverrides: vi.fn(() => ({})),
}))

vi.mock('../src/services/mcp-service.js', () => ({
  discoverMcpStates: discoverMcpStatesMock,
  resolveDeniedMcpServers: vi.fn(() => []),
  applyDeniedMcpServers: vi.fn((states) => states),
  applyPluginMcpAvailability: vi.fn((states) => states),
  mcpStatesToDeniedServers: vi.fn(() => []),
}))

vi.mock('../src/services/launch-preset-service.js', () => ({
  createLaunchPresetService: () => ({
    listPresets: listLaunchPresetsMock,
    readPresetSettings: readLaunchPresetSettingsMock,
    readLastUsed: vi.fn().mockResolvedValue(undefined),
    writeLastUsed: writeLastUsedLaunchPresetMock,
    writeTempSettings: writeTempSettingsMock,
    cleanupTempScripts: cleanupTempScriptsMock,
    writeSessionBinding: writeSessionBindingMock,
    recordSessionExit: recordSessionExitMock,
  }),
}))

vi.mock('../src/services/claude-session-service.js', () => ({
  createClaudeSessionService: () => ({
    snapshot: vi.fn().mockResolvedValue(new Set<string>()),
    findNewSessionId: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../src/services/global-last-settings-service.js', () => ({
  createGlobalLastSettingsService: () => ({
    readLastUsed: readLastUsedGlobalSettingsMock,
    writeLastUsed: writeLastUsedGlobalSettingsMock,
  }),
}))

vi.mock('../src/services/ccsp-config-service.js', () => ({
  createCcspConfigService: () => ({
    read: vi.fn().mockResolvedValue({
      globalPresetEnvOnly: false,
      statusLineEnabled: true,
      settingsDisplayFormat: 'yaml',
      runMode: 'both',
    }),
    write: vi.fn(),
    setOption: vi.fn(),
  }),
}))

vi.mock('../src/services/claude-login-service.js', () => ({
  createClaudeLoginService: () => ({
    isLoggedIn: vi.fn().mockResolvedValue(false),
  }),
}))

vi.mock('../src/services/settings-finalizer-service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/settings-finalizer-service.js')>()
  return {
    ...actual,
    finalizeLaunchSettings: vi.fn(async (baseInput: unknown, launchInput: unknown) =>
      actual.finalizeSettings(baseInput, launchInput)),
  }
})

describe('cli direct run', () => {
  beforeEach(() => {
    vi.resetModules()
    renderMock.mockReset()
    listPresetsMock.mockReset()
    readIndexMock.mockReset()
    getPresetPathMock.mockReset()
    readPresetSettingsMock.mockReset()
    listLaunchPresetsMock.mockReset()
    readLaunchPresetSettingsMock.mockReset()
    writeLastUsedGlobalSettingsMock.mockReset()
    writeLastUsedLaunchPresetMock.mockReset()
    writeTempSettingsMock.mockClear()
    spawnClaudeMock.mockReset()
    spawnClaudeMock.mockResolvedValue(0)
    discoverSettingsSourcesMock.mockReset()
    discoverSettingsSourcesMock.mockResolvedValue([])
    discoverMcpStatesMock.mockReset()
    discoverMcpStatesMock.mockResolvedValue([])

    readIndexMock.mockResolvedValue({ version: 1, presets: { work: basePreset } })
    listPresetsMock.mockResolvedValue([basePreset])
    getPresetPathMock.mockResolvedValue(selectedSettings.sourcePath)
    readPresetSettingsMock.mockResolvedValue(selectedSettings.settings)
    listLaunchPresetsMock.mockResolvedValue([
      { name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
    ])
    readLaunchPresetSettingsMock.mockResolvedValue({
      enabledPlugins: { alpha: false },
      skillOverrides: {},
      deniedMcpServers: [],
    })
  })

  it('launches Claude directly when global and project presets are specified', async () => {
    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', '-g', 'work', '-p', 'web'])

    expect(renderMock).not.toHaveBeenCalled()
    expect(writeLastUsedGlobalSettingsMock).toHaveBeenCalledWith('/tmp/project', 'work')
    expect(writeLastUsedLaunchPresetMock).toHaveBeenCalledWith('web')
    expect(spawnClaudeMock).toHaveBeenCalledWith('/tmp/project/.claude/.ccsp/tmp/temp-settings.json', [])
  })

  it('renders dry-run preview without launching Claude', async () => {
    const unmountMock = vi.fn()
    renderMock.mockReturnValue({ unmount: unmountMock })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', '-g', 'work', '--dry-run'])

    expect(spawnClaudeMock).not.toHaveBeenCalled()
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(unmountMock).toHaveBeenCalledTimes(1)
    const element = renderMock.mock.calls[0]?.[0] as React.ReactElement<{ global?: { cursor: number }; project?: unknown }>
    expect(element.props.global?.cursor).toBe(0)
    expect(element.props.project).toBeUndefined()
  })

  it('uses remembered global preset ordering in dry-run preview', async () => {
    const unmountMock = vi.fn()
    renderMock.mockReturnValue({ unmount: unmountMock })

    const otherPreset = {
      type: 'base' as const,
      name: 'alpha',
      fileName: 'alpha-settings.json',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    }

    listPresetsMock.mockResolvedValue([otherPreset, basePreset])
    getPresetPathMock.mockImplementation(async (name: string) => `/tmp/.ccsp/settings/${name}-settings.json`)
    readPresetSettingsMock.mockImplementation(async (name: string) => ({ source: name }))
    readLastUsedGlobalSettingsMock.mockResolvedValue('work')

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', '-g', 'alpha', '--dry-run'])

    const element = renderMock.mock.calls[0]?.[0] as React.ReactElement<{
      global?: { items: Array<{ name: string }>; cursor: number }
    }>
    expect(element.props.global?.items.map(item => item.name)).toEqual(['work', 'alpha'])
    expect(element.props.global?.cursor).toBe(1)
    expect(unmountMock).toHaveBeenCalledTimes(1)
  })

  it('keeps interactive flow when only dry-run is provided', async () => {
    renderMock.mockReturnValue({ waitUntilExit: async () => undefined, clear: vi.fn(), rerender: vi.fn() })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', '--dry-run'])

    expect(spawnClaudeMock).not.toHaveBeenCalled()
    expect(renderMock).toHaveBeenCalled()
    const element = renderMock.mock.calls[0]?.[0] as React.ReactElement<{ onSubmit?: unknown }>
    expect(element.props.onSubmit).toBeTypeOf('function')
  })

  it('does not direct-launch when ccsp flags precede a subcommand', async () => {
    renderMock.mockReturnValue({ waitUntilExit: async () => undefined, clear: vi.fn(), rerender: vi.fn() })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', '-g', 'work', 'manage'])

    expect(spawnClaudeMock).not.toHaveBeenCalled()
    expect(renderMock).toHaveBeenCalled()
  })

  it('passes claude flags through direct launch', async () => {
    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', '-g', 'work', '--model', 'opus'])

    expect(spawnClaudeMock).toHaveBeenCalledWith(
      '/tmp/project/.claude/.ccsp/tmp/temp-settings.json',
      ['--model', 'opus'],
    )
  })

  it('throws when the requested global preset does not exist', async () => {
    readIndexMock.mockResolvedValue({ version: 1, presets: {} })
    listPresetsMock.mockResolvedValue([])

    const { main } = await import('../src/cli.js')
    await expect(main(['node', 'cli', '-g', 'missing'])).rejects.toMatchObject({
      message: 'Preset not found: missing',
    })
  })

  it('uses detected toggles when project preset is Detected', async () => {
    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', '-g', 'work', '-p', 'Detected'])

    expect(writeLastUsedLaunchPresetMock).not.toHaveBeenCalled()
    expect(writeTempSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: { allow: ['Read(*)'] } }),
      expect.any(String),
    )
    expect(spawnClaudeMock).toHaveBeenCalled()
  })
})
