import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const selectedItem = {
  name: 'global-base',
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
    const writeLastUsed = vi.fn().mockResolvedValue(undefined)
    const writePresetSettings = vi.fn().mockResolvedValue(launchPreset)
    const createPreset = vi.fn()

    vi.doMock('figlet', () => ({
      default: { textSync: () => 'CCSP' },
    }))
    vi.doMock('gradient-string', () => ({
      default: () => (text: string) => text,
    }))
    vi.doMock('../src/core/paths.js', () => ({
      createPathContext: () => ({ homeDir: '/Users/test', cwd: '/repo/project' }),
      resolveGlobalRoot: () => '/Users/test/.ccsp',
    }))
    vi.doMock('../src/services/preset-service.js', () => ({
      createPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([{ name: selectedItem.name, type: 'base' }]),
        getPresetPath: vi.fn().mockResolvedValue(selectedItem.sourcePath),
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
    vi.doMock('../src/services/launch-preset-service.js', () => ({
      createLaunchPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([launchPreset]),
        readPresetSettings: vi.fn().mockResolvedValue({
          enabledPlugins: {},
          skillOverrides: {},
          deniedMcpServers: [],
        }),
        readLastUsed: vi.fn().mockResolvedValue(undefined),
        writeLastUsed,
        writeTempSettings,
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
      applyDeniedMcpServers: vi.fn().mockReturnValue([]),
      mcpStatesToDeniedServers: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/settings-finalizer-service.js', () => ({
      finalizeSettings: vi.fn().mockImplementation((base: object, launch: object) => ({ base, launch })),
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
    vi.doMock('../src/core/paths.js', () => ({
      createPathContext: () => ({ homeDir: '/Users/test', cwd: '/repo/project' }),
      resolveGlobalRoot: () => '/Users/test/.ccsp',
    }))
    vi.doMock('../src/services/preset-service.js', () => ({
      createPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([]),
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
    vi.doMock('../src/services/launch-preset-service.js', () => ({
      createLaunchPresetService: () => ({
        listPresets: vi.fn().mockResolvedValue([launchPreset]),
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
      applyDeniedMcpServers: vi.fn().mockReturnValue([]),
      mcpStatesToDeniedServers: vi.fn().mockReturnValue([]),
    }))
    vi.doMock('../src/services/settings-finalizer-service.js', () => ({
      finalizeSettings: vi.fn(),
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
})
