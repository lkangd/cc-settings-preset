import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const selectedItem = {
  name: 'global-base',
  fileName: 'global-base-settings.json',
  sourcePath: '/presets/global-base.json',
  settings: { env: { FOO: 'bar' } },
}

const launchPreset = {
  name: 'project-web',
  fileName: 'project-web.json',
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
}

function unwrapRenderedElement(element: unknown): unknown {
  if (!React.isValidElement(element)) return element

  const props = element.props as Record<string, unknown>
  if ('onSubmit' in props || 'onRenameSubmit' in props) return element

  const child = props.children
  if (Array.isArray(child)) {
    for (const item of child) {
      const unwrapped = unwrapRenderedElement(item)
      if (React.isValidElement(unwrapped) && ('onSubmit' in (unwrapped.props as Record<string, unknown>) || 'onRenameSubmit' in (unwrapped.props as Record<string, unknown>))) {
        return unwrapped
      }
    }
    return element
  }

  if (React.isValidElement(child)) return unwrapRenderedElement(child)
  return element
}

describe('manage launch flow', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('routes manage launch through project launch selection before spawning Claude', async () => {
    const renderSequence: string[] = []
    const spawnClaude = vi.fn().mockResolvedValue(0)
    const writeTempSettings = vi.fn().mockResolvedValue('/tmp/final-settings.json')
    const cleanupTempScripts = vi.fn().mockResolvedValue(undefined)
    const writeSessionBinding = vi.fn().mockResolvedValue(undefined)
    const recordSessionExit = vi.fn().mockResolvedValue(undefined)
    const discoveredSessionId = '99999999-9999-4999-8999-999999999999'
    const claudeSnapshot = vi.fn().mockResolvedValue(new Set<string>())
    const findNewSessionId = vi.fn().mockResolvedValue(discoveredSessionId)
    const writeLastUsed = vi.fn().mockResolvedValue(undefined)
    const writePresetSettings = vi.fn().mockResolvedValue(launchPreset)
    const createPreset = vi.fn()

    vi.doMock('figlet', () => ({
      default: { textSync: () => 'CCSP' },
    }))
    vi.doMock('gradient-string', () => ({
      default: () => (text: string) => text,
    }))
    vi.doMock('../src/core/paths.js', async () => {
      const actual = await vi.importActual<typeof import('../src/core/paths.js')>('../src/core/paths.js')
      return {
        ...actual,
        createPathContext: () => ({ homeDir: '/Users/test', cwd: '/repo/project' }),
        resolveGlobalRoot: () => '/Users/test/.ccsp',
      }
    })
    vi.doMock('../src/services/preset-service.js', () => ({
      createPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([{ name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' }]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([{ meta: { name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' }, sourcePath: selectedItem.sourcePath, settings: selectedItem.settings }]),
        getPresetPath: vi.fn().mockResolvedValue(selectedItem.sourcePath),
        readIndex: vi.fn().mockResolvedValue({
          version: 1,
          presets: {
            [selectedItem.name]: { name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' },
          },
        }),
        readPresetSettings: vi.fn().mockResolvedValue(selectedItem.settings),
        renamePreset: vi.fn(),
        deletePreset: vi.fn(),
        createBasePreset: vi.fn(),
      }),
    }))
    vi.doMock('../src/services/settings-source-service.js', () => ({
      createSettingsSourceService: () => ({
        discoverSettingsSources: vi.fn().mockResolvedValue([
          {
            scope: 'user',
            filePath: '/repo/project/.claude/settings.json',
            settings: {},
          },
        ]),
      }),
    }))
    vi.doMock('../src/services/global-last-settings-service.js', () => ({
      createGlobalLastSettingsService: () => ({
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/ccsp-config-service.js', () => ({
      createCcspConfigService: () => ({
        read: vi.fn().mockResolvedValue({ globalPresetEnvOnly: true, statusLineEnabled: true, settingsDisplayFormat: 'yaml' }),
        write: vi.fn().mockResolvedValue(undefined),
        setOption: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/claude-login-service.js', () => ({
      createClaudeLoginService: () => ({
        isLoggedIn: vi.fn().mockResolvedValue(false),
      }),
    }))
    vi.doMock('../src/services/claude-session-service.js', () => ({
      createClaudeSessionService: () => ({
        snapshot: claudeSnapshot,
        findNewSessionId,
      }),
    }))
    vi.doMock('../src/services/launch-preset-service.js', () => ({
      createLaunchPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([launchPreset]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([{ meta: launchPreset, settings: { enabledPlugins: {}, skillOverrides: {}, deniedMcpServers: [] } }]),
        readPresetSettings: vi.fn().mockResolvedValue({
          enabledPlugins: {},
          skillOverrides: {},
          deniedMcpServers: [],
        }),
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed,
        writeTempSettings,
        cleanupTempScripts,
        writeSessionBinding,
        recordSessionExit,
        writePresetSettings,
        createPreset,
      }),
    }))
    vi.doMock('../src/services/plugin-service.js', () => ({
      resolvePluginStates: vi.fn().mockReturnValue([]),
      pluginStatesToEnabledPlugins: vi.fn().mockReturnValue({}),
      applyPluginOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/skill-service.js', () => ({
      discoverSkillStates: vi.fn().mockResolvedValue([]),
      resolveSkillOverrides: vi.fn().mockReturnValue({}),
      skillStatesToOverrides: vi.fn().mockReturnValue({}),
      applySkillOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/mcp-service.js', () => ({
      discoverMcpStates: vi.fn().mockResolvedValue([]),
      resolveDeniedMcpServers: vi.fn().mockReturnValue([]),
      applyPluginMcpAvailability: vi.fn((mcps: unknown[]) => mcps),
      applyDeniedMcpServers: vi.fn().mockReturnValue([]),
      mcpStatesToDeniedServers: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/settings-finalizer-service.js', () => ({
      finalizeSettings: vi.fn().mockImplementation((base: object, launch: object) => ({ base, launch })),
      finalizeLaunchSettings: vi.fn().mockImplementation(async (base: object, launch: object) => ({ base, launch })),
      resolveProjectPresetName: vi.fn().mockReturnValue('Detected'),
    }))
    vi.doMock('../src/core/spawn.js', () => ({
      spawnClaude,
    }))
    vi.doMock('ink', () => ({
      Text: ({ children }: { children?: React.ReactNode }) => children,
      render: (element: React.ReactElement) => {
        const typedElement = unwrapRenderedElement(element) as React.ReactElement<{
          onSubmit: (value: unknown) => void
        }>
        const typeName = typeof typedElement.type === 'string' ? typedElement.type : (typedElement.type as { name?: string }).name ?? 'unknown'
        renderSequence.push(typeName)

        if (typeName === 'ManageApp') {
          typedElement.props.onSubmit({ type: 'launch', item: selectedItem })
        }

        if (typeName === 'ProjectLaunchApp') {
          typedElement.props.onSubmit({
            type: 'launch',
            presetName: launchPreset.name,
            toggles: { plugins: [], skills: [], mcps: [] },
          })
        }

        return {
          waitUntilExit: async () => {},
        }
      },
    }))

    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const { createProgram } = await import('../src/cli.js')

    await createProgram().parseAsync(['node', 'ccsp', 'manage'])

    expect(renderSequence).toEqual(['ManageApp', 'ProjectLaunchApp'])
    expect(writePresetSettings).toHaveBeenCalledWith(launchPreset.name, {
      enabledPlugins: {},
      skillOverrides: {},
      deniedMcpServers: [],
    })
    expect(createPreset).not.toHaveBeenCalled()
    expect(writeTempSettings).toHaveBeenCalledOnce()
    expect(cleanupTempScripts).toHaveBeenCalledOnce()
    expect(claudeSnapshot).toHaveBeenCalledOnce()
    expect(findNewSessionId).toHaveBeenCalledOnce()
    expect(writeSessionBinding).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: discoveredSessionId,
      presetLabel: `${selectedItem.name}/Detected`,
    }))
    expect(recordSessionExit).toHaveBeenCalledWith(discoveredSessionId)
    expect(writeLastUsed).toHaveBeenCalledWith(launchPreset.name)
    expect(spawnClaude).toHaveBeenCalledWith('/tmp/final-settings.json', [])
    expect(stderrWrite).toHaveBeenCalled()
  })

  it('refreshes project manage after rename and creates from detected on save', async () => {
    const renderSequence: string[] = []
    const renamePreset = vi.fn().mockResolvedValue(undefined)
    const createPreset = vi.fn().mockResolvedValue({ ...launchPreset, name: 'detected-new' })

    vi.doMock('figlet', () => ({
      default: { textSync: () => 'CCSP' },
    }))
    vi.doMock('gradient-string', () => ({
      default: () => (text: string) => text,
    }))
    vi.doMock('../src/core/paths.js', async () => {
      const actual = await vi.importActual<typeof import('../src/core/paths.js')>('../src/core/paths.js')
      return {
        ...actual,
        createPathContext: () => ({ homeDir: '/Users/test', cwd: '/repo/project' }),
        resolveGlobalRoot: () => '/Users/test/.ccsp',
      }
    })
    vi.doMock('../src/services/preset-service.js', () => ({
      createPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([]),
        getPresetPath: vi.fn(),
        readPresetSettings: vi.fn(),
        renamePreset: vi.fn(),
        deletePreset: vi.fn(),
        createBasePreset: vi.fn(),
      }),
    }))
    vi.doMock('../src/services/settings-source-service.js', () => ({
      createSettingsSourceService: () => ({
        discoverSettingsSources: vi.fn().mockResolvedValue([
          {
            scope: 'project',
            filePath: '/repo/project/.claude/settings.json',
            settings: {},
          },
        ]),
      }),
    }))
    vi.doMock('../src/services/global-last-settings-service.js', () => ({
      createGlobalLastSettingsService: () => ({
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/ccsp-config-service.js', () => ({
      createCcspConfigService: () => ({
        read: vi.fn().mockResolvedValue({ globalPresetEnvOnly: true, statusLineEnabled: true, settingsDisplayFormat: 'yaml' }),
        write: vi.fn().mockResolvedValue(undefined),
        setOption: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/claude-login-service.js', () => ({
      createClaudeLoginService: () => ({
        isLoggedIn: vi.fn().mockResolvedValue(false),
      }),
    }))
    vi.doMock('../src/services/launch-preset-service.js', () => ({
      createLaunchPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([launchPreset]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([{ meta: launchPreset, settings: { enabledPlugins: {}, skillOverrides: {}, deniedMcpServers: [] } }]),
        readPresetSettings: vi.fn().mockResolvedValue({
          enabledPlugins: {},
          skillOverrides: {},
          deniedMcpServers: [],
        }),
        readLastUsed: vi.fn().mockResolvedValue(launchPreset.name),
        writeLastUsed: vi.fn().mockResolvedValue(undefined),
        writeTempSettings: vi.fn(),
        writePresetSettings: vi.fn(),
        renamePreset,
        deletePreset: vi.fn(),
        createPreset,
      }),
    }))
    vi.doMock('../src/services/plugin-service.js', () => ({
      resolvePluginStates: vi.fn().mockReturnValue([]),
      pluginStatesToEnabledPlugins: vi.fn().mockReturnValue({}),
      applyPluginOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/skill-service.js', () => ({
      discoverSkillStates: vi.fn().mockResolvedValue([]),
      resolveSkillOverrides: vi.fn().mockReturnValue({}),
      skillStatesToOverrides: vi.fn().mockReturnValue({}),
      applySkillOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/mcp-service.js', () => ({
      discoverMcpStates: vi.fn().mockResolvedValue([]),
      resolveDeniedMcpServers: vi.fn().mockReturnValue([]),
      applyPluginMcpAvailability: vi.fn((mcps: unknown[]) => mcps),
      applyDeniedMcpServers: vi.fn().mockReturnValue([]),
      mcpStatesToDeniedServers: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/settings-finalizer-service.js', () => ({
      finalizeSettings: vi.fn(),
      finalizeLaunchSettings: vi.fn(),
      resolveProjectPresetName: vi.fn().mockReturnValue('Detected'),
    }))
    vi.doMock('../src/core/spawn.js', () => ({
      spawnClaude: vi.fn(),
    }))
    vi.doMock('ink', () => {
      let projectManageRenderCount = 0
      return {
        Text: ({ children }: { children?: React.ReactNode }) => children,
        render: (element: React.ReactElement) => {
          const typedElement = unwrapRenderedElement(element) as React.ReactElement<{
            onSubmit: (value: unknown) => void
            onRenameSubmit?: (presetName: string, newName: string) => Promise<string | null>
          }>
          const typeName = typeof typedElement.type === 'string' ? typedElement.type : (typedElement.type as { name?: string }).name ?? 'unknown'
          renderSequence.push(typeName)

          if (typeName === 'ProjectManageApp') {
            projectManageRenderCount += 1
            return {
              waitUntilExit: async () => {
                if (projectManageRenderCount === 1) {
                  await typedElement.props.onRenameSubmit?.(launchPreset.name, 'project-app')
                  typedElement.props.onSubmit({ type: 'refresh' })
                  return
                }
                if (projectManageRenderCount === 2) {
                  typedElement.props.onSubmit({
                    type: 'create',
                    saveAs: 'detected-new',
                    toggles: { plugins: [], skills: [], mcps: [] },
                  })
                }
              },
            }
          }

          return {
            waitUntilExit: async () => {},
          }
        },
      }
    })

    const { createProgram } = await import('../src/cli.js')

    await createProgram().parseAsync(['node', 'ccsp', 'manage', '--project'])

    expect(renderSequence).toEqual(['ProjectManageApp', 'ProjectManageApp', 'ProjectManageApp'])
    expect(renamePreset).toHaveBeenCalledWith('project-web', 'project-app')
    expect(createPreset).toHaveBeenCalledWith('detected-new', {
      enabledPlugins: {},
      skillOverrides: {},
      deniedMcpServers: [],
    })
  })

  it('runs global-only mode without rendering project launch selection', async () => {
    const renderSequence: string[] = []
    const spawnClaude = vi.fn().mockResolvedValue(0)
    const writeTempSettings = vi.fn().mockResolvedValue('/tmp/final-settings.json')
    const cleanupTempScripts = vi.fn().mockResolvedValue(undefined)
    const writeSessionBinding = vi.fn().mockResolvedValue(undefined)
    const recordSessionExit = vi.fn().mockResolvedValue(undefined)
    const claudeSnapshot = vi.fn().mockResolvedValue(new Set<string>())
    const findNewSessionId = vi.fn().mockResolvedValue('sess-global')
    const writeGlobalLastUsed = vi.fn().mockResolvedValue(undefined)
    const finalizeLaunchSettings = vi.fn().mockResolvedValue({ finalized: true })

    vi.doMock('figlet', () => ({ default: { textSync: () => 'CCSP' } }))
    vi.doMock('gradient-string', () => ({ default: () => (text: string) => text }))
    vi.doMock('../src/core/paths.js', async () => {
      const actual = await vi.importActual<typeof import('../src/core/paths.js')>('../src/core/paths.js')
      return {
        ...actual,
        createPathContext: () => ({ homeDir: '/Users/test', cwd: '/repo/project' }),
        resolveGlobalRoot: () => '/Users/test/.ccsp',
        resolveUserClaudeSettingsPath: () => '/Users/test/.claude/settings.json',
      }
    })
    vi.doMock('../src/services/preset-service.js', () => ({
      createPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([{ name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' }]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([{ meta: { name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' }, sourcePath: selectedItem.sourcePath, settings: selectedItem.settings }]),
        getPresetPath: vi.fn().mockResolvedValue(selectedItem.sourcePath),
        readIndex: vi.fn().mockResolvedValue({
          version: 1,
          presets: {
            [selectedItem.name]: { name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' },
          },
        }),
        readPresetSettings: vi.fn().mockResolvedValue(selectedItem.settings),
        buildClaudeOfficialItem: vi.fn(),
        renamePreset: vi.fn(),
        deletePreset: vi.fn(),
        createBasePreset: vi.fn(),
      }),
    }))
    vi.doMock('../src/services/settings-source-service.js', () => ({
      createSettingsSourceService: () => ({
        discoverSettingsSources: vi.fn().mockResolvedValue([
          { scope: 'project' as const, filePath: '/repo/project/.claude/settings.json', settings: {} },
        ]),
      }),
    }))
    vi.doMock('../src/services/global-last-settings-service.js', () => ({
      createGlobalLastSettingsService: () => ({
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed: writeGlobalLastUsed,
      }),
    }))
    vi.doMock('../src/services/ccsp-config-service.js', () => ({
      createCcspConfigService: () => ({
        read: vi.fn().mockResolvedValue({
          globalPresetEnvOnly: true,
          statusLineEnabled: true,
          settingsDisplayFormat: 'yaml',
          runMode: 'global-only',
        }),
        write: vi.fn().mockResolvedValue(undefined),
        setOption: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/claude-login-service.js', () => ({
      createClaudeLoginService: () => ({ isLoggedIn: vi.fn().mockResolvedValue(false) }),
    }))
    vi.doMock('../src/services/claude-session-service.js', () => ({
      createClaudeSessionService: () => ({ snapshot: claudeSnapshot, findNewSessionId }),
    }))
    vi.doMock('../src/services/launch-preset-service.js', () => ({
      createLaunchPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([]),
        readPresetSettings: vi.fn(),
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed: vi.fn(),
        writeTempSettings,
        cleanupTempScripts,
        writeSessionBinding,
        recordSessionExit,
      }),
    }))
    vi.doMock('../src/services/plugin-service.js', () => ({
      resolvePluginStates: vi.fn().mockReturnValue([
        { name: 'alpha', enabled: true, source: 'preset' },
        { name: 'beta', enabled: false, source: 'project' },
      ]),
      pluginStatesToEnabledPlugins: vi.fn().mockReturnValue({ alpha: true, beta: false }),
      applyPluginOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/skill-service.js', () => ({
      discoverSkillStates: vi.fn().mockResolvedValue([
        { name: 'personal', enabled: true, source: 'user', toggleable: true },
      ]),
      resolveSkillOverrides: vi.fn().mockReturnValue({}),
      skillStatesToOverrides: vi.fn().mockReturnValue({}),
      applySkillOverrides: vi.fn((skills: unknown[]) => skills),
    }))
    vi.doMock('../src/services/mcp-service.js', () => ({
      discoverMcpStates: vi.fn().mockResolvedValue([
        { name: 'github', enabled: true, source: 'project', config: {} },
        { name: 'filesystem', enabled: false, source: 'user', config: {} },
      ]),
      resolveDeniedMcpServers: vi.fn().mockReturnValue([]),
      applyPluginMcpAvailability: vi.fn((mcps: unknown[]) => mcps),
      applyDeniedMcpServers: vi.fn((mcps: unknown[]) => mcps),
      mcpStatesToDeniedServers: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/settings-finalizer-service.js', () => ({
      finalizeSettings: vi.fn(),
      finalizeLaunchSettings,
      resolveProjectPresetName: vi.fn().mockReturnValue('Detected'),
    }))
    vi.doMock('../src/core/spawn.js', () => ({ spawnClaude }))
    vi.doMock('ink', () => ({
      Text: ({ children }: { children?: React.ReactNode }) => children,
      render: (element: React.ReactElement) => {
        const typedElement = unwrapRenderedElement(element) as React.ReactElement<{ onSubmit: (value: unknown) => void }>
        const typeName = typeof typedElement.type === 'string' ? typedElement.type : (typedElement.type as { name?: string }).name ?? 'unknown'
        renderSequence.push(typeName)

        if (typeName === 'SettingsSelectApp') {
          typedElement.props.onSubmit(selectedItem)
        }

        if (typeName === 'ProjectLaunchApp') {
          throw new Error('ProjectLaunchApp should not render in global-only mode')
        }

        return { waitUntilExit: async () => {} }
      },
    }))

    const { main } = await import('../src/cli.js')

    await main(['node', 'ccsp'])

    expect(renderSequence).toEqual(['SettingsSelectApp'])
    expect(writeGlobalLastUsed).toHaveBeenCalledWith('/repo/project', selectedItem.name)
    expect(finalizeLaunchSettings).toHaveBeenCalledWith(selectedItem.settings, selectedItem.settings, expect.objectContaining({
      presetLabel: `${selectedItem.name}/Detected`,
      toggles: {
        plugins: [
          { name: 'alpha', enabled: true, source: 'preset' },
          { name: 'beta', enabled: false, source: 'project' },
        ],
        skills: [
          { name: 'personal', enabled: true, source: 'user', toggleable: true },
        ],
        mcps: [
          { name: 'github', enabled: true, source: 'project', config: {} },
          { name: 'filesystem', enabled: false, source: 'user', config: {} },
        ],
      },
    }))
    expect(writeSessionBinding).toHaveBeenCalledWith(expect.objectContaining({
      globalName: selectedItem.name,
      projectPresetName: 'Detected',
      presetLabel: `${selectedItem.name}/Detected`,
      launchSettings: selectedItem.settings,
    }))
    expect(writeTempSettings).toHaveBeenCalledWith({ finalized: true }, expect.any(String))
    expect(cleanupTempScripts).toHaveBeenCalledOnce()
    expect(claudeSnapshot).toHaveBeenCalledOnce()
    expect(findNewSessionId).toHaveBeenCalledOnce()
    expect(recordSessionExit).toHaveBeenCalledWith('sess-global')
    expect(spawnClaude).toHaveBeenCalledWith('/tmp/final-settings.json', [])
  })

  it('runs project-only mode from project settings and labels statusline with project preset only', async () => {
    const renderSequence: string[] = []
    const spawnClaude = vi.fn().mockResolvedValue(0)
    const writeTempSettings = vi.fn().mockResolvedValue('/tmp/final-settings.json')
    const cleanupTempScripts = vi.fn().mockResolvedValue(undefined)
    const writeSessionBinding = vi.fn().mockResolvedValue(undefined)
    const recordSessionExit = vi.fn().mockResolvedValue(undefined)
    const claudeSnapshot = vi.fn().mockResolvedValue(new Set<string>())
    const findNewSessionId = vi.fn().mockResolvedValue('sess-project')
    const writeLastUsed = vi.fn().mockResolvedValue(undefined)
    const writePresetSettings = vi.fn().mockResolvedValue(launchPreset)
    const finalizeLaunchSettings = vi.fn().mockResolvedValue({ finalized: true })
    const projectSettings = { env: { PROJECT: 'true' } }

    vi.doMock('figlet', () => ({ default: { textSync: () => 'CCSP' } }))
    vi.doMock('gradient-string', () => ({ default: () => (text: string) => text }))
    vi.doMock('../src/core/paths.js', async () => {
      const actual = await vi.importActual<typeof import('../src/core/paths.js')>('../src/core/paths.js')
      return {
        ...actual,
        createPathContext: () => ({ homeDir: '/Users/test', cwd: '/repo/project' }),
        resolveGlobalRoot: () => '/Users/test/.ccsp',
        resolveUserClaudeSettingsPath: () => '/Users/test/.claude/settings.json',
      }
    })
    vi.doMock('../src/services/preset-service.js', () => ({
      createPresetService: () => ({
        listPresets: vi.fn(),
        listPresetsWithSettings: vi.fn().mockResolvedValue([]),
        getPresetPath: vi.fn(),
        readPresetSettings: vi.fn(),
        buildClaudeOfficialItem: vi.fn(),
        renamePreset: vi.fn(),
        deletePreset: vi.fn(),
        createBasePreset: vi.fn(),
      }),
    }))
    vi.doMock('../src/services/settings-source-service.js', () => ({
      createSettingsSourceService: () => ({
        discoverSettingsSources: vi.fn().mockResolvedValue([
          { scope: 'project-local', filePath: '/repo/project/.claude/settings.local.json', settings: projectSettings },
        ]),
      }),
    }))
    vi.doMock('../src/services/global-last-settings-service.js', () => ({
      createGlobalLastSettingsService: () => ({
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/ccsp-config-service.js', () => ({
      createCcspConfigService: () => ({
        read: vi.fn().mockResolvedValue({
          globalPresetEnvOnly: true,
          statusLineEnabled: true,
          settingsDisplayFormat: 'yaml',
          runMode: 'project-only',
        }),
        write: vi.fn().mockResolvedValue(undefined),
        setOption: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/claude-login-service.js', () => ({
      createClaudeLoginService: () => ({ isLoggedIn: vi.fn().mockResolvedValue(false) }),
    }))
    vi.doMock('../src/services/claude-session-service.js', () => ({
      createClaudeSessionService: () => ({ snapshot: claudeSnapshot, findNewSessionId }),
    }))
    vi.doMock('../src/services/launch-preset-service.js', () => ({
      createLaunchPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([launchPreset]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([{ meta: launchPreset, settings: { enabledPlugins: {}, skillOverrides: {}, deniedMcpServers: [] } }]),
        readPresetSettings: vi.fn().mockResolvedValue({ enabledPlugins: {}, skillOverrides: {}, deniedMcpServers: [] }),
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed,
        writeTempSettings,
        cleanupTempScripts,
        writeSessionBinding,
        recordSessionExit,
        writePresetSettings,
      }),
    }))
    vi.doMock('../src/services/plugin-service.js', () => ({
      resolvePluginStates: vi.fn().mockReturnValue([]),
      pluginStatesToEnabledPlugins: vi.fn().mockReturnValue({}),
      applyPluginOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/skill-service.js', () => ({
      discoverSkillStates: vi.fn().mockResolvedValue([]),
      resolveSkillOverrides: vi.fn().mockReturnValue({}),
      skillStatesToOverrides: vi.fn().mockReturnValue({}),
      applySkillOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/mcp-service.js', () => ({
      discoverMcpStates: vi.fn().mockResolvedValue([]),
      resolveDeniedMcpServers: vi.fn().mockReturnValue([]),
      applyPluginMcpAvailability: vi.fn((mcps: unknown[]) => mcps),
      applyDeniedMcpServers: vi.fn().mockReturnValue([]),
      mcpStatesToDeniedServers: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/settings-finalizer-service.js', () => ({
      finalizeSettings: vi.fn(),
      finalizeLaunchSettings,
      resolveProjectPresetName: vi.fn().mockReturnValue(launchPreset.name),
    }))
    vi.doMock('../src/core/spawn.js', () => ({ spawnClaude }))
    vi.doMock('ink', () => ({
      Text: ({ children }: { children?: React.ReactNode }) => children,
      render: (element: React.ReactElement) => {
        const typedElement = unwrapRenderedElement(element) as React.ReactElement<{ onSubmit: (value: unknown) => void }>
        const typeName = typeof typedElement.type === 'string' ? typedElement.type : (typedElement.type as { name?: string }).name ?? 'unknown'
        renderSequence.push(typeName)

        if (typeName === 'SettingsSelectApp') {
          throw new Error('SettingsSelectApp should not render in project-only mode')
        }

        if (typeName === 'ProjectLaunchApp') {
          typedElement.props.onSubmit({
            type: 'launch',
            presetName: launchPreset.name,
            toggles: { plugins: [], skills: [], mcps: [] },
          })
        }

        return { waitUntilExit: async () => {} }
      },
    }))

    const { main } = await import('../src/cli.js')

    await main(['node', 'ccsp'])

    expect(renderSequence).toEqual(['ProjectLaunchApp'])
    expect(writePresetSettings).toHaveBeenCalledWith(launchPreset.name, {
      enabledPlugins: {},
      skillOverrides: {},
      deniedMcpServers: [],
    })
    expect(writeLastUsed).toHaveBeenCalledWith(launchPreset.name)
    expect(finalizeLaunchSettings).toHaveBeenCalledWith(projectSettings, {
      enabledPlugins: {},
      skillOverrides: {},
      deniedMcpServers: [],
    }, expect.objectContaining({
      presetLabel: `*Claude Official*/${launchPreset.name}`,
    }))
    expect(writeSessionBinding).toHaveBeenCalledWith(expect.objectContaining({
      globalName: 'project-local',
      projectPresetName: launchPreset.name,
      presetLabel: `*Claude Official*/${launchPreset.name}`,
    }))
    expect(spawnClaude).toHaveBeenCalledWith('/tmp/final-settings.json', [])
  })

  it('respects config.runMode when launching from manage', async () => {
    const spawnClaude = vi.fn().mockResolvedValue(0)
    const writeTempSettings = vi.fn().mockResolvedValue('/tmp/final-settings.json')
    const cleanupTempScripts = vi.fn().mockResolvedValue(undefined)
    const writeSessionBinding = vi.fn().mockResolvedValue(undefined)
    const recordSessionExit = vi.fn().mockResolvedValue(undefined)
    const claudeSnapshot = vi.fn().mockResolvedValue(new Set<string>())
    const findNewSessionId = vi.fn().mockResolvedValue('sess-manage-global')

    vi.doMock('figlet', () => ({ default: { textSync: () => 'CCSP' } }))
    vi.doMock('gradient-string', () => ({ default: () => (text: string) => text }))
    vi.doMock('../src/core/paths.js', async () => {
      const actual = await vi.importActual<typeof import('../src/core/paths.js')>('../src/core/paths.js')
      return {
        ...actual,
        createPathContext: () => ({ homeDir: '/Users/test', cwd: '/repo/project' }),
        resolveGlobalRoot: () => '/Users/test/.ccsp',
      }
    })
    vi.doMock('../src/services/preset-service.js', () => ({
      createPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([{ name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' }]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([{ meta: { name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' }, sourcePath: selectedItem.sourcePath, settings: selectedItem.settings }]),
        getPresetPath: vi.fn().mockResolvedValue(selectedItem.sourcePath),
        readIndex: vi.fn().mockResolvedValue({
          version: 1,
          presets: {
            [selectedItem.name]: { name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' },
          },
        }),
        readPresetSettings: vi.fn().mockResolvedValue(selectedItem.settings),
        renamePreset: vi.fn(),
        deletePreset: vi.fn(),
        createBasePreset: vi.fn(),
      }),
    }))
    vi.doMock('../src/services/settings-source-service.js', () => ({
      createSettingsSourceService: () => ({
        discoverSettingsSources: vi.fn().mockResolvedValue([
          { scope: 'user', filePath: '/Users/test/.claude/settings.json', settings: {} },
        ]),
      }),
    }))
    vi.doMock('../src/services/global-last-settings-service.js', () => ({
      createGlobalLastSettingsService: () => ({
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/ccsp-config-service.js', () => ({
      createCcspConfigService: () => ({
        read: vi.fn().mockResolvedValue({
          globalPresetEnvOnly: true,
          statusLineEnabled: true,
          settingsDisplayFormat: 'yaml',
          runMode: 'global-only',
        }),
        write: vi.fn().mockResolvedValue(undefined),
        setOption: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/claude-login-service.js', () => ({
      createClaudeLoginService: () => ({ isLoggedIn: vi.fn().mockResolvedValue(false) }),
    }))
    vi.doMock('../src/services/claude-session-service.js', () => ({
      createClaudeSessionService: () => ({ snapshot: claudeSnapshot, findNewSessionId }),
    }))
    vi.doMock('../src/services/launch-preset-service.js', () => ({
      createLaunchPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([launchPreset]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([{ meta: launchPreset, settings: { enabledPlugins: {}, skillOverrides: {}, deniedMcpServers: [] } }]),
        readPresetSettings: vi.fn().mockResolvedValue({ enabledPlugins: {}, skillOverrides: {}, deniedMcpServers: [] }),
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed: vi.fn().mockResolvedValue(undefined),
        writeTempSettings,
        cleanupTempScripts,
        writeSessionBinding,
        recordSessionExit,
        writePresetSettings: vi.fn(),
        createPreset: vi.fn(),
      }),
    }))
    vi.doMock('../src/services/plugin-service.js', () => ({
      resolvePluginStates: vi.fn().mockReturnValue([]),
      pluginStatesToEnabledPlugins: vi.fn().mockReturnValue({}),
      applyPluginOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/skill-service.js', () => ({
      discoverSkillStates: vi.fn().mockResolvedValue([]),
      resolveSkillOverrides: vi.fn().mockReturnValue({}),
      skillStatesToOverrides: vi.fn().mockReturnValue({}),
      applySkillOverrides: vi.fn((skills: unknown[]) => skills),
    }))
    vi.doMock('../src/services/mcp-service.js', () => ({
      discoverMcpStates: vi.fn().mockResolvedValue([]),
      resolveDeniedMcpServers: vi.fn().mockReturnValue([]),
      applyPluginMcpAvailability: vi.fn((mcps: unknown[]) => mcps),
      applyDeniedMcpServers: vi.fn((mcps: unknown[]) => mcps),
      mcpStatesToDeniedServers: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/settings-finalizer-service.js', () => ({
      finalizeSettings: vi.fn().mockImplementation((base: object, launch: object) => ({ base, launch })),
      finalizeLaunchSettings: vi.fn().mockImplementation(async (base: object, launch: object) => ({ base, launch })),
      resolveProjectPresetName: vi.fn().mockReturnValue('Detected'),
    }))
    vi.doMock('../src/core/spawn.js', () => ({ spawnClaude }))
    vi.doMock('ink', () => ({
      Text: ({ children }: { children?: React.ReactNode }) => children,
      render: (element: React.ReactElement) => {
        const typedElement = unwrapRenderedElement(element) as React.ReactElement<{
          onSubmit: (value: unknown) => void
        }>
        const typeName = typeof typedElement.type === 'string'
          ? typedElement.type
          : (typedElement.type as { name?: string }).name ?? 'unknown'

        if (typeName === 'ManageApp') {
          typedElement.props.onSubmit({ type: 'launch', item: selectedItem })
        }

        if (typeName === 'ProjectLaunchApp') {
          throw new Error('ProjectLaunchApp should not render when manage launches in global-only mode')
        }

        return { waitUntilExit: async () => {} }
      },
    }))

    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const { createProgram } = await import('../src/cli.js')

    await createProgram().parseAsync(['node', 'ccsp', 'manage'])

    expect(writeSessionBinding).toHaveBeenCalledWith(expect.objectContaining({
      presetLabel: `${selectedItem.name}/Detected`,
    }))
  })

  it('uses the selected global preset name when manage launches in project-only mode', async () => {
    const spawnClaude = vi.fn().mockResolvedValue(0)
    const writeTempSettings = vi.fn().mockResolvedValue('/tmp/final-settings.json')
    const cleanupTempScripts = vi.fn().mockResolvedValue(undefined)
    const writeSessionBinding = vi.fn().mockResolvedValue(undefined)
    const recordSessionExit = vi.fn().mockResolvedValue(undefined)
    const claudeSnapshot = vi.fn().mockResolvedValue(new Set<string>())
    const findNewSessionId = vi.fn().mockResolvedValue('sess-manage-project')
    const writeLastUsed = vi.fn().mockResolvedValue(undefined)
    const writePresetSettings = vi.fn().mockResolvedValue(launchPreset)

    vi.doMock('figlet', () => ({ default: { textSync: () => 'CCSP' } }))
    vi.doMock('gradient-string', () => ({ default: () => (text: string) => text }))
    vi.doMock('../src/core/paths.js', async () => {
      const actual = await vi.importActual<typeof import('../src/core/paths.js')>('../src/core/paths.js')
      return {
        ...actual,
        createPathContext: () => ({ homeDir: '/Users/test', cwd: '/repo/project' }),
        resolveGlobalRoot: () => '/Users/test/.ccsp',
      }
    })
    vi.doMock('../src/services/preset-service.js', () => ({
      createPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([{ name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' }]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([{ meta: { name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' }, sourcePath: selectedItem.sourcePath, settings: selectedItem.settings }]),
        getPresetPath: vi.fn().mockResolvedValue(selectedItem.sourcePath),
        readIndex: vi.fn().mockResolvedValue({
          version: 1,
          presets: {
            [selectedItem.name]: { name: selectedItem.name, fileName: selectedItem.fileName, type: 'base' },
          },
        }),
        readPresetSettings: vi.fn().mockResolvedValue(selectedItem.settings),
        renamePreset: vi.fn(),
        deletePreset: vi.fn(),
        createBasePreset: vi.fn(),
      }),
    }))
    vi.doMock('../src/services/settings-source-service.js', () => ({
      createSettingsSourceService: () => ({
        discoverSettingsSources: vi.fn().mockResolvedValue([
          { scope: 'user', filePath: '/Users/test/.claude/settings.json', settings: {} },
        ]),
      }),
    }))
    vi.doMock('../src/services/global-last-settings-service.js', () => ({
      createGlobalLastSettingsService: () => ({
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/ccsp-config-service.js', () => ({
      createCcspConfigService: () => ({
        read: vi.fn().mockResolvedValue({
          globalPresetEnvOnly: true,
          statusLineEnabled: true,
          settingsDisplayFormat: 'yaml',
          runMode: 'project-only',
        }),
        write: vi.fn().mockResolvedValue(undefined),
        setOption: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../src/services/claude-login-service.js', () => ({
      createClaudeLoginService: () => ({ isLoggedIn: vi.fn().mockResolvedValue(false) }),
    }))
    vi.doMock('../src/services/claude-session-service.js', () => ({
      createClaudeSessionService: () => ({ snapshot: claudeSnapshot, findNewSessionId }),
    }))
    vi.doMock('../src/services/launch-preset-service.js', () => ({
      createLaunchPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([launchPreset]),
        listPresetsWithSettings: vi.fn().mockResolvedValue([{ meta: launchPreset, settings: { enabledPlugins: {}, skillOverrides: {}, deniedMcpServers: [] } }]),
        readPresetSettings: vi.fn().mockResolvedValue({ enabledPlugins: {}, skillOverrides: {}, deniedMcpServers: [] }),
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed,
        writeTempSettings,
        cleanupTempScripts,
        writeSessionBinding,
        recordSessionExit,
        writePresetSettings,
      }),
    }))
    vi.doMock('../src/services/plugin-service.js', () => ({
      resolvePluginStates: vi.fn().mockReturnValue([]),
      pluginStatesToEnabledPlugins: vi.fn().mockReturnValue({}),
      applyPluginOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/skill-service.js', () => ({
      discoverSkillStates: vi.fn().mockResolvedValue([]),
      resolveSkillOverrides: vi.fn().mockReturnValue({}),
      skillStatesToOverrides: vi.fn().mockReturnValue({}),
      applySkillOverrides: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/mcp-service.js', () => ({
      discoverMcpStates: vi.fn().mockResolvedValue([]),
      resolveDeniedMcpServers: vi.fn().mockReturnValue([]),
      applyPluginMcpAvailability: vi.fn((mcps: unknown[]) => mcps),
      applyDeniedMcpServers: vi.fn().mockReturnValue([]),
      mcpStatesToDeniedServers: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/settings-finalizer-service.js', () => ({
      finalizeSettings: vi.fn(),
      finalizeLaunchSettings: vi.fn().mockResolvedValue({ finalized: true }),
      resolveProjectPresetName: vi.fn().mockReturnValue(launchPreset.name),
    }))
    vi.doMock('../src/core/spawn.js', () => ({ spawnClaude }))
    vi.doMock('ink', () => ({
      Text: ({ children }: { children?: React.ReactNode }) => children,
      render: (element: React.ReactElement) => {
        const typedElement = unwrapRenderedElement(element) as React.ReactElement<{
          onSubmit: (value: unknown) => void
        }>
        const typeName = typeof typedElement.type === 'string'
          ? typedElement.type
          : (typedElement.type as { name?: string }).name ?? 'unknown'

        if (typeName === 'ManageApp') {
          typedElement.props.onSubmit({ type: 'launch', item: selectedItem })
        }

        if (typeName === 'ProjectLaunchApp') {
          typedElement.props.onSubmit({
            type: 'launch',
            presetName: launchPreset.name,
            toggles: { plugins: [], skills: [], mcps: [] },
          })
        }

        return { waitUntilExit: async () => {} }
      },
    }))

    vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const { createProgram } = await import('../src/cli.js')

    await createProgram().parseAsync(['node', 'ccsp', 'manage'])

    expect(writeSessionBinding).toHaveBeenCalledWith(expect.objectContaining({
      presetLabel: `${selectedItem.name}/${launchPreset.name}`,
    }))
    expect(writeLastUsed).toHaveBeenCalledWith(launchPreset.name)
    expect(spawnClaude).toHaveBeenCalledWith('/tmp/final-settings.json', [])
  })
})
