import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ManageResult } from '../src/ink/manage-app.js'
import { sanitizeClaudeArgs } from '../src/core/args.js'
import { runInTty } from './helpers/tty.js'

const renderMock = vi.fn()
const clearMock = vi.fn()
const instanceCleanupMock = vi.fn()
const listPresetsMock = vi.fn()
const deletePresetMock = vi.fn()
const renamePresetMock = vi.fn()
const writePresetSettingsByNameMock = vi.fn()
const createProjectLaunchPresetMock = vi.fn()
const writeLastUsedLaunchPresetMock = vi.fn()
const readLastUsedGlobalSettingsMock = vi.fn()
const writeLastUsedGlobalSettingsMock = vi.fn()
const writeTempSettingsMock = vi.fn().mockResolvedValue('/tmp/project/.claude/.ccsp/tmp/temp-settings.json')
const discoverSettingsSourcesMock = vi.fn().mockResolvedValue([])
const discoverMcpStatesMock = vi.fn().mockResolvedValue([])
const spawnClaudeMock = vi.fn().mockResolvedValue(0)

type ManageAppElement = React.ReactElement<{ onSubmit: (result: ManageResult) => void; initialState?: { renamePresetName?: string; renameValue?: string; renameError?: string } }>

vi.mock('ink', () => ({
  render: renderMock,
}))

vi.mock('../src/core/paths.js', async () => {
  const actual = await vi.importActual<typeof import('../src/core/paths.js')>('../src/core/paths.js')
  return {
    ...actual,
    createPathContext: () => ({ homeDir: '/tmp/home', cwd: '/tmp/project' }),
    resolveGlobalRoot: () => '/tmp/.ccsp',
  }
})

vi.mock('../src/services/preset-service.js', () => ({
  createPresetService: () => ({
    listPresets: listPresetsMock,
    deletePreset: deletePresetMock,
    renamePreset: renamePresetMock,
    getPresetPath: vi.fn((name: string) => Promise.resolve(`/tmp/.ccsp/settings/${name}.json`)),
    readPresetSettings: vi.fn().mockResolvedValue({}),
    writePresetSettingsByName: writePresetSettingsByNameMock,
    createBasePreset: vi.fn(),
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
  forceEnablePlugins: vi.fn((plugins) => plugins),
  resolvePluginStates: vi.fn(() => []),
  pluginStatesToEnabledPlugins: vi.fn((plugins = []) => Object.fromEntries(plugins.map((plugin: { name: string; enabled: boolean }) => [plugin.name, plugin.enabled]))),
}))

vi.mock('../src/services/skill-service.js', () => ({
  applySkillOverrides: vi.fn((skills) => skills),
  discoverSkillStates: vi.fn().mockResolvedValue([]),
  forceEnableSkills: vi.fn((skills) => skills),
  skillStatesToOverrides: vi.fn((skills = []) => Object.fromEntries(skills.filter((skill: { name: string; enabled: boolean; toggleable: boolean }) => skill.toggleable && !skill.enabled).map((skill: { name: string }) => [skill.name, 'off']))),
}))

vi.mock('../src/services/launch-preset-service.js', () => ({
  createLaunchPresetService: () => ({
    listPresets: vi.fn().mockResolvedValue([]),
    readPresetSettings: vi.fn().mockResolvedValue({}),
    createPreset: createProjectLaunchPresetMock,
    writePresetSettings: vi.fn(),
    renamePreset: vi.fn(),
    deletePreset: vi.fn(),
    readLastUsed: vi.fn().mockResolvedValue(undefined),
    writeLastUsed: writeLastUsedLaunchPresetMock,
    writeTempSettings: writeTempSettingsMock,
  }),
}))

vi.mock('../src/services/global-last-settings-service.js', () => ({
  createGlobalLastSettingsService: () => ({
    readLastUsed: readLastUsedGlobalSettingsMock,
    writeLastUsed: writeLastUsedGlobalSettingsMock,
  }),
}))

const figletTextSync = vi.fn((text: string, options?: { font?: string }) => {
  if (text === 'C C S P') {
    return options?.font === 'ANSI Shadow'
      ? 'BIG\nBIG\nBIG'
      : text
  }

  return text
})

vi.mock('figlet', () => ({
  default: {
    textSync: figletTextSync,
  },
}))

vi.mock('../src/services/mcp-service.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/mcp-service.js')>('../src/services/mcp-service.js')
  return { ...actual, discoverMcpStates: discoverMcpStatesMock }
})

describe('cli argument behavior', () => {
  it('keeps claude passthrough args while stripping reserved settings', () => {
    expect(sanitizeClaudeArgs(['--resume', 'abc', '--settings=bad.json']).args).toEqual(['--resume', 'abc'])
  })

  it('registers the project manage option', async () => {
    const { createProgram } = await import('../src/cli.js')
    const manage = createProgram().commands.find(command => command.name() === 'manage')
    expect(manage?.options.map(option => option.flags)).toContain('-p, --project')
  })

  it('prints a centered CCSP banner with a centered CCSettingsPreset subtitle', async () => {
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const originalColumns = process.stderr.columns
    Object.defineProperty(process.stderr, 'columns', { value: 120, configurable: true })

    const { printBanner } = await import('../src/cli.js')
    printBanner()

    expect(stderrWriteSpy).toHaveBeenCalledTimes(1)

    const output = stderrWriteSpy.mock.calls[0]?.[0]
    expect(typeof output).toBe('string')

    if (typeof output !== 'string') {
      throw new Error('Expected printBanner to write a string to stderr')
    }

    const normalized = normalizeTerminalOutput(output)
    expect(normalized).toContain('BIG')
    expect(normalized).toContain('CCSettingsPreset')
    expect(figletTextSync).toHaveBeenCalledWith('C C S P', { font: 'ANSI Shadow' })

    Object.defineProperty(process.stderr, 'columns', { value: originalColumns, configurable: true })
    stderrWriteSpy.mockRestore()
  })
})

describe('run command', () => {
  beforeEach(() => {
    vi.resetModules()
    renderMock.mockReset()
    instanceCleanupMock.mockReset()
    listPresetsMock.mockReset()
    deletePresetMock.mockReset()
    writePresetSettingsByNameMock.mockReset()
    renamePresetMock.mockReset()
    createProjectLaunchPresetMock.mockReset()
    createProjectLaunchPresetMock.mockResolvedValue({ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' })
    writeLastUsedLaunchPresetMock.mockReset()
    readLastUsedGlobalSettingsMock.mockReset()
    readLastUsedGlobalSettingsMock.mockResolvedValue(undefined)
    writeLastUsedGlobalSettingsMock.mockReset()
    writeTempSettingsMock.mockReset()
    writeTempSettingsMock.mockResolvedValue('/tmp/project/.claude/.ccsp/tmp/temp-settings.json')
    discoverSettingsSourcesMock.mockReset()
    discoverSettingsSourcesMock.mockResolvedValue([])
    discoverMcpStatesMock.mockReset()
    discoverMcpStatesMock.mockResolvedValue([])
    spawnClaudeMock.mockReset()
    spawnClaudeMock.mockResolvedValue(0)
  })

  it('selects settings, saves a project launch preset, finalizes settings, and launches Claude', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base-settings.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }
    listPresetsMock.mockResolvedValue([basePreset])

    renderMock
      .mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
        element.props.onSubmit({
          name: 'base',
          sourcePath: '/tmp/.ccsp/settings/base-settings.json',
          settings: { permissions: { allow: ['Read(*)'] } },
        })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
        element.props.onSubmit({
          type: 'launch',
          saveAs: 'web',
          toggles: {
            plugins: [{ name: 'alpha', enabled: false, source: 'user' }],
            skills: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
            mcps: [{ name: 'github', enabled: false, source: 'project', config: {} }],
          },
        })
        return { waitUntilExit: async () => undefined }
      })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli'])

    expect(createProjectLaunchPresetMock).toHaveBeenCalledWith('web', {
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })
    expect(writeTempSettingsMock).toHaveBeenCalledWith({
      permissions: { allow: ['Read(*)'] },
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })
    expect(spawnClaudeMock).toHaveBeenCalledWith('/tmp/project/.claude/.ccsp/tmp/temp-settings.json', [])
  })

  it('reopens the last used global preset and remembers the new selection', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'work',
      fileName: 'work-settings.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }
    const otherPreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base-settings.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }
    listPresetsMock.mockResolvedValue([basePreset, otherPreset])
    readLastUsedGlobalSettingsMock.mockResolvedValue('work')

    renderMock
      .mockImplementationOnce((element: React.ReactElement<{ initialName?: string; onSubmit: (result: unknown) => void }>) => {
        expect(element.props.initialName).toBe('work')
        element.props.onSubmit({
          name: 'base',
          sourcePath: '/tmp/.ccsp/settings/base-settings.json',
          settings: {},
        })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
        element.props.onSubmit({
          type: 'launch',
          presetName: 'base',
          toggles: {
            plugins: [],
            skills: [],
            mcps: [],
          },
        })
        return { waitUntilExit: async () => undefined }
      })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli'])

    expect(writeLastUsedGlobalSettingsMock).toHaveBeenCalledWith('/tmp/project', 'base')
  })

  it('ignores a remembered preset that no longer exists', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base-settings.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }
    listPresetsMock.mockResolvedValue([basePreset])
    readLastUsedGlobalSettingsMock.mockResolvedValue('stale')

    renderMock
      .mockImplementationOnce((element: React.ReactElement<{ initialName?: string; onSubmit: (result: unknown) => void }>) => {
        expect(element.props.initialName).toBeUndefined()
        element.props.onSubmit({
          name: 'base',
          sourcePath: '/tmp/.ccsp/settings/base-settings.json',
          settings: {},
        })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
        element.props.onSubmit({
          type: 'launch',
          presetName: 'base',
          toggles: {
            plugins: [],
            skills: [],
            mcps: [],
          },
        })
        return { waitUntilExit: async () => undefined }
      })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli'])

    expect(writeLastUsedGlobalSettingsMock).toHaveBeenCalledWith('/tmp/project', 'base')
  })

  it('launches temporary settings without saving a project launch preset', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base-settings.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }
    listPresetsMock.mockResolvedValue([basePreset])

    renderMock
      .mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
        element.props.onSubmit({ name: 'base', sourcePath: '/tmp/.ccsp/settings/base-settings.json', settings: {} })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
        element.props.onSubmit({ type: 'temp-launch', toggles: { plugins: [], skills: [], mcps: [] } })
        return { waitUntilExit: async () => undefined }
      })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli'])

    expect(createProjectLaunchPresetMock).not.toHaveBeenCalled()
    expect(writeTempSettingsMock).toHaveBeenCalledWith({})
  })
})

function normalizeTerminalOutput(value: string): string {
  return value
    .replace(/\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[@-_]/g, '')
    .replace(/[ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function waitFor(output: () => string, expected: string): Promise<void> {
  const start = Date.now()

  while (!normalizeTerminalOutput(output()).includes(expected)) {
    if (Date.now() - start > 5000) {
      throw new Error(
        `Timed out waiting for output to include: ${expected}\n\nCurrent output:\n${normalizeTerminalOutput(output())}`,
      )
    }

    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

describe('manage command', () => {
  beforeEach(() => {
    vi.resetModules()
    renderMock.mockReset()
    instanceCleanupMock.mockReset()
    listPresetsMock.mockReset()
    deletePresetMock.mockReset()
    writePresetSettingsByNameMock.mockReset()
    renamePresetMock.mockReset()
    writeTempSettingsMock.mockReset()
    writeTempSettingsMock.mockResolvedValue('/tmp/project/.claude/.ccsp/tmp/temp-settings.json')
    discoverSettingsSourcesMock.mockReset()
    discoverSettingsSourcesMock.mockResolvedValue([])
    spawnClaudeMock.mockReset()
    spawnClaudeMock.mockResolvedValue(0)
  })

  it('reopens the preset list after deleting a preset', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }

    listPresetsMock
      .mockResolvedValueOnce([basePreset])
      .mockResolvedValueOnce([])

    renderMock
      .mockImplementationOnce((element: ManageAppElement) => {
        element.props.onSubmit({ type: 'delete', item: { name: 'base', sourcePath: '/tmp/.ccsp/settings/base.json', settings: {} } })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: ManageAppElement) => {
        element.props.onSubmit({ type: 'exit' })
        return { waitUntilExit: async () => undefined }
      })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', 'manage'])

    expect(deletePresetMock).toHaveBeenCalledWith('base')
    expect(renderMock).toHaveBeenCalledTimes(2)
    expect(listPresetsMock).toHaveBeenCalledTimes(2)
  })

  it('renames a settings preset and reopens manage after a rename result', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }

    listPresetsMock
      .mockResolvedValueOnce([basePreset])
      .mockResolvedValueOnce([basePreset])

    renderMock
      .mockImplementationOnce((element: ManageAppElement) => {
        element.props.onSubmit({ type: 'rename', item: { name: 'base', sourcePath: '/tmp/.ccsp/settings/base.json', settings: {} }, newName: 'work' })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: ManageAppElement) => {
        element.props.onSubmit({ type: 'exit' })
        return { waitUntilExit: async () => undefined }
      })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', 'manage'])

    expect(renamePresetMock).toHaveBeenCalledWith('base', 'work')
    expect(renderMock).toHaveBeenCalledTimes(2)
  })

  it('launches the selected settings file from manage mode through project launch selection', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }

    listPresetsMock.mockResolvedValueOnce([basePreset])

    renderMock
      .mockImplementationOnce((element: ManageAppElement) => {
        element.props.onSubmit({ type: 'launch', item: { name: 'base', sourcePath: '/tmp/.ccsp/settings/base.json', settings: {} } })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
        element.props.onSubmit({
          type: 'launch',
          toggles: { plugins: [], skills: [], mcps: [] },
        })
        return { waitUntilExit: async () => undefined }
      })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', 'manage'])

    expect(renderMock).toHaveBeenCalledTimes(2)
    expect(writeTempSettingsMock).toHaveBeenCalledWith({})
    expect(spawnClaudeMock).toHaveBeenCalledWith('/tmp/project/.claude/.ccsp/tmp/temp-settings.json', [])
  })

  it('enters project preset management directly without a settings selection screen in project manage mode', async () => {
    discoverSettingsSourcesMock.mockResolvedValueOnce([
      {
        scope: 'project',
        filePath: '/tmp/project/.claude/settings.json',
        settings: { permissions: { allow: ['Read(*)'] } },
      },
      {
        scope: 'user',
        filePath: '/tmp/home/.claude/settings.json',
        settings: { permissions: { allow: ['Write(*)'] } },
      },
    ])

    renderMock.mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
      element.props.onSubmit({
        type: 'launch',
        toggles: { plugins: [], skills: [], mcps: [] },
      })
      return { waitUntilExit: async () => undefined }
    })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', 'manage', '--project'])

    expect(discoverSettingsSourcesMock).toHaveBeenCalled()
    expect(listPresetsMock).not.toHaveBeenCalled()
    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(writeTempSettingsMock).toHaveBeenCalledWith({ permissions: { allow: ['Read(*)'] } })
    expect(spawnClaudeMock).toHaveBeenCalledWith('/tmp/project/.claude/.ccsp/tmp/temp-settings.json', [])
  })

  it('prints a message and exits when project manage mode finds no project settings sources', async () => {
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', 'manage', '--project'])

    expect(renderMock).not.toHaveBeenCalled()
    expect(stderrWriteSpy).toHaveBeenCalledWith('No project settings sources found for project preset management.\n')

    stderrWriteSpy.mockRestore()
  })

  it('does not accumulate rename prompts after repeated rename conflicts in a real tty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-tty-'))
    const homeDir = join(root, 'home')
    const cwd = join(root, 'project')
    const globalRoot = join(homeDir, '.ccsp')
    const settingsDir = join(globalRoot, 'settings')

    await mkdir(settingsDir, { recursive: true })
    await mkdir(cwd, { recursive: true })
    await writeFile(join(globalRoot, 'index.json'), `${JSON.stringify({
      version: 1,
      presets: {
        'test-dddd': {
          type: 'base',
          name: 'test-dddd',
          fileName: 'test-dddd.json',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      },
    }, null, 2)}\n`)
    await writeFile(join(settingsDir, 'test-dddd.json'), '{}\n')

    const result = await runInTty({
      command: ['node', 'dist/cli.js', 'manage'],
      cwd: process.cwd(),
      env: {
        HOME: homeDir,
        TERM: 'xterm-256color',
      },
      steps: [
        { type: 'read', ms: 1500 },
        { type: 'write', data: 'r' },
        { type: 'read', ms: 800 },
        { type: 'write', data: 'test-dddd' },
        { type: 'read', ms: 500 },
        { type: 'write', data: '\r' },
        { type: 'read', ms: 4000 },
        { type: 'write', data: '\r' },
        { type: 'read', ms: 4000 },
      ],
    })

    expect(result.rawOutput.length).toBeGreaterThan(0)
    expect(result.normalizedOutput).toContain('Preset already exists: test-dddd')
    expect(result.finalFrame).toContain('Preset already exists: test-dddd')
    expect((result.finalFrame.match(/Rename test-dddd to/g) ?? []).length).toBe(1)
  }, 15000)
})
