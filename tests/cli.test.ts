import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ManageResult } from '../src/ink/manage-app.js'
import { sanitizeClaudeArgs } from '../src/core/args.js'
import { runInTty } from './helpers/tty.js'

const createBasePresetMock = vi.fn()
const readJsonFileMock = vi.fn().mockResolvedValue({})
const renderMock = vi.fn()
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
const cleanupTempScriptsMock = vi.fn().mockResolvedValue(undefined)
const writeSessionBindingMock = vi.fn().mockResolvedValue(undefined)
const recordSessionExitMock = vi.fn().mockResolvedValue(undefined)
const readSessionBindingMock = vi.fn().mockResolvedValue(undefined)
const findLatestExitedSessionMock = vi.fn().mockResolvedValue(undefined)
const claudeSessionSnapshotMock = vi.fn().mockResolvedValue(new Set<string>())
const findNewClaudeSessionIdMock = vi.fn().mockResolvedValue(undefined)
const discoverSettingsSourcesMock = vi.fn().mockResolvedValue([])
const discoverMcpStatesMock = vi.fn().mockResolvedValue([])
const spawnClaudeMock = vi.fn().mockResolvedValue(0)

type ManageAppElement = React.ReactElement<{ onSubmit: (result: ManageResult) => void; initialState?: { renamePresetName?: string; renameValue?: string; renameError?: string } }>
type CreateAppElement = React.ReactElement<{ onSubmit: (result: { sourcePath: string; name: string }) => void }>

function unwrapRenderedElement(element: unknown): unknown {
  if (!React.isValidElement(element)) {
    return element
  }

  const props = element.props as Record<string, unknown>
  if ('onSubmit' in props) {
    return element
  }

  const child = props.children
  if (Array.isArray(child)) {
    for (const item of child) {
      const unwrapped = unwrapRenderedElement(item)
      if (React.isValidElement(unwrapped) && 'onSubmit' in (unwrapped.props as Record<string, unknown>)) {
        return unwrapped
      }
    }
    return element
  }

  if (React.isValidElement(child)) {
    return unwrapRenderedElement(child)
  }

  return element
}

vi.mock('../src/core/json.js', () => ({
  readJsonFile: readJsonFileMock,
}))

vi.mock('ink', () => ({
  Text: ({ children }: { children?: React.ReactNode }) => children,
  render: (element: unknown) => renderMock(unwrapRenderedElement(element)),
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
    createBasePreset: createBasePresetMock,
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
  pluginStatesToEnabledPlugins: vi.fn((plugins = []) => Object.fromEntries(plugins.filter((plugin: { enabled: boolean }) => !plugin.enabled).map((plugin: { name: string }) => [plugin.name, false]))),
}))

vi.mock('../src/services/skill-service.js', () => ({
  applySkillOverrides: vi.fn((skills) => skills),
  discoverSkillStates: vi.fn().mockResolvedValue([]),
  resolveSkillOverrides: vi.fn(() => ({})),
  skillStatesToOverrides: vi.fn((skills = []) => Object.fromEntries(skills.filter((skill: { name: string; enabled: boolean; toggleable: boolean }) => skill.toggleable && !skill.enabled).map((skill: { name: string }) => [skill.name, 'off']))),
}))

vi.mock('../src/services/mcp-service.js', () => ({
  discoverMcpStates: vi.fn().mockResolvedValue([]),
  resolveDeniedMcpServers: vi.fn(() => []),
  applyDeniedMcpServers: vi.fn((states) => states),
  mcpStatesToDeniedServers: vi.fn(() => []),
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
    cleanupTempScripts: cleanupTempScriptsMock,
    writeSessionBinding: writeSessionBindingMock,
    recordSessionExit: recordSessionExitMock,
    readSessionBinding: readSessionBindingMock,
    findLatestExitedSession: findLatestExitedSessionMock,
  }),
}))

vi.mock('../src/services/claude-session-service.js', () => ({
  createClaudeSessionService: () => ({
    snapshot: claudeSessionSnapshotMock,
    findNewSessionId: findNewClaudeSessionIdMock,
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
    read: vi.fn().mockResolvedValue({ globalPresetEnvOnly: true, statusLineEnabled: true, settingsDisplayFormat: 'yaml' }),
    write: vi.fn().mockResolvedValue(undefined),
    setOption: vi.fn().mockResolvedValue(undefined),
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

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

describe('cli argument behavior', () => {
  it('keeps claude passthrough args while stripping reserved settings', () => {
    expect(sanitizeClaudeArgs(['--resume', 'abc', '--settings=bad.json']).args).toEqual(['--resume', 'abc'])
  })

  it('registers the project manage option', async () => {
    const { createProgram } = await import('../src/cli.js')
    const manage = createProgram().commands.find(command => command.name() === 'manage')
    expect(manage?.options.map(option => option.flags)).toContain('-p, --project')
  })

  it('shows package version in help output', async () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const { createProgram } = await import('../src/cli.js')
    const help = createProgram().helpInformation()

    expect(help).toContain(`v${pkg.version}`)
  })

  it('selects a banner candidate that fits within the terminal width', async () => {
    const { buildBannerLines } = await import('../src/cli.js')

    const wide = buildBannerLines(120)
    const narrow = buildBannerLines(40)

    expect(Math.max(...wide.map(line => stripAnsi(line).length))).toBeLessThanOrEqual(120)
    expect(Math.max(...narrow.map(line => stripAnsi(line).length))).toBeLessThanOrEqual(40)
    expect(wide.join('\n')).not.toEqual(narrow.join('\n'))
  })

  it('centers the selected banner lines against the full terminal width', async () => {
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const originalColumns = process.stderr.columns
    Object.defineProperty(process.stderr, 'columns', { value: 80, configurable: true })

    const { printBanner } = await import('../src/cli.js')
    printBanner()

    expect(stderrWriteSpy).toHaveBeenCalledTimes(1)

    const output = String(stderrWriteSpy.mock.calls[0]?.[0] ?? '')
    const visibleLines = output
      .split('\n')
      .map(line => stripAnsi(line))
      .filter(line => line.trim().length > 0)

    const firstBannerLine = visibleLines[0] ?? ''
    expect(firstBannerLine.startsWith(' ')).toBe(true)
    expect(firstBannerLine.length).toBeLessThanOrEqual(80)
    expect(normalizeTerminalOutput(output)).toContain('CC-Settings-Preset')

    Object.defineProperty(process.stderr, 'columns', { value: originalColumns, configurable: true })
    stderrWriteSpy.mockRestore()
  })

  it('clears terminal history before rerendering on resize', async () => {
    const write = vi.fn()
    const stdout = Object.assign(new EventEmitter(), {
      write,
    }) as unknown as Pick<NodeJS.WriteStream, 'on' | 'off' | 'write'> & EventEmitter
    const app = {
      clear: vi.fn(),
      rerender: vi.fn(),
      waitUntilExit: vi.fn().mockResolvedValue(undefined),
    }
    const createNode = vi.fn<() => React.ReactElement>()
      .mockReturnValue(React.createElement('box', { id: 'resized' }))

    const { waitForInkAppExit } = await import('../src/cli.js')
    const wait = waitForInkAppExit(app, createNode, stdout)

    stdout.emit('resize')

    expect(write).toHaveBeenCalledWith('\x1b[3J\x1b[H\x1b[2J')
    expect(app.clear).toHaveBeenCalledTimes(1)
    expect(createNode).toHaveBeenCalledTimes(1)
    expect(app.rerender).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          children: expect.objectContaining({
            props: expect.objectContaining({
              children: expect.objectContaining({
                props: expect.objectContaining({
                  children: expect.arrayContaining([
                    expect.anything(),
                    expect.objectContaining({
                      props: expect.objectContaining({ id: 'resized' })
                    })
                  ])
                })
              })
            })
          }),
          value: 1,
        })
      })
    )
    const writeOrder = write.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    const clearOrder = app.clear.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    const rerenderOrder = app.rerender.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY
    expect(writeOrder).toBeLessThan(clearOrder)
    expect(clearOrder).toBeLessThan(rerenderOrder)

    await wait
    expect(stdout.listenerCount('resize')).toBe(0)
  })

  it('forces a clear and rerender on ctrl+l', async () => {
    const write = vi.fn()
    const stdout = Object.assign(new EventEmitter(), {
      write,
    }) as unknown as Pick<NodeJS.WriteStream, 'on' | 'off' | 'write'> & EventEmitter
    const app = {
      clear: vi.fn(),
      rerender: vi.fn(),
      waitUntilExit: vi.fn().mockResolvedValue(undefined),
    }
    const createNode = vi.fn<() => React.ReactElement>()
      .mockReturnValue(React.createElement('box', { id: 'refresh' }))

    const { createGlobalShortcutHandler } = await import('../src/cli.js')
    const handler = createGlobalShortcutHandler(app, createNode, stdout)

    handler('l', { ctrl: true })

    expect(write).toHaveBeenCalledWith('\x1b[3J\x1b[H\x1b[2J')
    expect(app.clear).toHaveBeenCalledTimes(1)
    expect(app.rerender).toHaveBeenCalledTimes(1)
    expect(app.rerender).toHaveBeenCalledWith(
      expect.objectContaining({
        props: expect.objectContaining({
          children: expect.objectContaining({
            props: expect.objectContaining({
              children: expect.objectContaining({
                props: expect.objectContaining({ children: expect.any(Array) })
              })
            })
          })
        })
      })
    )
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
    }, expect.any(String))
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
    expect(writeTempSettingsMock).toHaveBeenCalledWith({}, expect.any(String))
  })

  it('does not mark a session exited when Claude launch throws', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base-settings.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }
    listPresetsMock.mockResolvedValue([basePreset])
    spawnClaudeMock.mockRejectedValueOnce(new Error('spawn failed'))
    recordSessionExitMock.mockClear()
    cleanupTempScriptsMock.mockClear()

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
    await expect(main(['node', 'cli'])).rejects.toThrow('spawn failed')
    expect(recordSessionExitMock).not.toHaveBeenCalled()
    expect(cleanupTempScriptsMock).toHaveBeenCalledOnce()
  })

  it('clears the screen and reopens global settings when backing out of project launch', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockReturnValue(true)
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
          settings: {},
        })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
        element.props.onSubmit({ type: 'back' })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce(() => ({ waitUntilExit: async () => undefined }))

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli'])

    expect(stdoutWrite).toHaveBeenCalledWith('\x1b[3J\x1b[H\x1b[2J')
    expect(renderMock).toHaveBeenCalledTimes(3)
    expect(spawnClaudeMock).not.toHaveBeenCalled()

    stdoutWrite.mockRestore()
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
    createBasePresetMock.mockReset()
    readJsonFileMock.mockReset()
    readJsonFileMock.mockResolvedValue({})
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

  it('creates a settings preset from manage mode and reopens the manage list', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }
    const workPreset = {
      type: 'base' as const,
      name: 'work',
      fileName: 'work.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }

    discoverSettingsSourcesMock.mockResolvedValueOnce([
      { scope: 'user', filePath: '/tmp/user/settings.json', settings: {} },
    ])
    listPresetsMock
      .mockResolvedValueOnce([basePreset])
      .mockResolvedValueOnce([basePreset, workPreset])
    createBasePresetMock.mockResolvedValueOnce(workPreset)

    renderMock
      .mockImplementationOnce((element: ManageAppElement) => {
        element.props.onSubmit({ type: 'create' })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: CreateAppElement) => {
        element.props.onSubmit({ sourcePath: '/tmp/user/settings.json', name: 'work' })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce((element: ManageAppElement) => {
        element.props.onSubmit({ type: 'exit' })
        return { waitUntilExit: async () => undefined }
      })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', 'manage'])

    expect(readJsonFileMock).toHaveBeenCalledWith('/tmp/user/settings.json')
    expect(createBasePresetMock).toHaveBeenCalledWith('work', {})
    expect(renderMock).toHaveBeenCalledTimes(3)
    expect(listPresetsMock).toHaveBeenCalledTimes(2)
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
    expect(writeTempSettingsMock).toHaveBeenCalledWith({}, expect.any(String))
    expect(spawnClaudeMock).toHaveBeenCalledWith('/tmp/project/.claude/.ccsp/tmp/temp-settings.json', [])
  })

  it('launches Claude from project manage mode without reopening the manage screen', async () => {
    discoverSettingsSourcesMock.mockResolvedValueOnce([
      {
        scope: 'project',
        filePath: '/tmp/project/.claude/settings.json',
        settings: { permissions: { allow: ['Read(*)'] } },
      },
    ])

    renderMock.mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
      element.props.onSubmit({
        type: 'launch',
        presetName: 'web',
        toggles: { plugins: [], skills: [], mcps: [] },
      })
      return { waitUntilExit: async () => undefined }
    })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', 'manage', '--project'])

    expect(renderMock).toHaveBeenCalledTimes(1)
    expect(writeTempSettingsMock).toHaveBeenCalled()
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

    renderMock
      .mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
        element.props.onSubmit({
          type: 'create',
          saveAs: 'project-manage-created',
          toggles: { plugins: [], skills: [], mcps: [] },
        })
        return { waitUntilExit: async () => undefined }
      })
      .mockImplementationOnce(() => ({ waitUntilExit: async () => undefined }))

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', 'manage', '--project'])

    expect(discoverSettingsSourcesMock).toHaveBeenCalled()
    expect(listPresetsMock).not.toHaveBeenCalled()
    expect(renderMock).toHaveBeenCalledTimes(2)
    expect(createProjectLaunchPresetMock).toHaveBeenCalledWith('project-manage-created', {
      enabledPlugins: {},
      skillOverrides: {},
      deniedMcpServers: [],
    })
    expect(writeTempSettingsMock).not.toHaveBeenCalled()
    expect(spawnClaudeMock).not.toHaveBeenCalled()
  })

  it('prints a message and exits when project manage mode finds no project settings sources', async () => {
    const stderrWriteSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli', 'manage', '--project'])

    expect(renderMock).not.toHaveBeenCalled()
    expect(stderrWriteSpy).toHaveBeenCalledWith('No project settings sources found for project preset management.\n')

    stderrWriteSpy.mockRestore()
  })

  it('prefills the current rename value in a real tty', async () => {
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
      ],
    })

    expect(result.rawOutput.length).toBeGreaterThan(0)
    expect(result.normalizedOutput).toContain('Rename test-dddd to test-dddd')
  }, 15000)
})
