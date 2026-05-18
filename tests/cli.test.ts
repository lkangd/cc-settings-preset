import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ManageResult } from '../src/ink/manage-app.js'
import { sanitizeClaudeArgs } from '../src/core/args.js'

const renderMock = vi.fn()
const listPresetsMock = vi.fn()
const deletePresetMock = vi.fn()
const writePresetSettingsByNameMock = vi.fn()
const findMatchingDerivedPresetMock = vi.fn()
const createDerivedPresetMock = vi.fn()

type ManageAppElement = React.ReactElement<{ onSubmit: (result: ManageResult) => void }>

vi.mock('ink', () => ({
  render: renderMock,
}))

vi.mock('../src/core/paths.js', () => ({
  createPathContext: () => ({ homeDir: '/tmp/home', cwd: '/tmp/project' }),
  resolveGlobalRoot: () => '/tmp/.ccsp',
}))

vi.mock('../src/services/preset-service.js', () => ({
  createPresetService: () => ({
    listPresets: listPresetsMock,
    deletePreset: deletePresetMock,
    renamePreset: vi.fn(),
    syncDerivedPreset: vi.fn((name: string) => Promise.resolve({
      type: 'derived' as const,
      name,
      parentName: 'base',
      fileName: `${name}.json`,
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    })),
    getPresetPath: vi.fn((name: string) => Promise.resolve(`/tmp/.ccsp/settings/${name}.json`)),
    readPresetSettings: vi.fn().mockResolvedValue({}),
    writePresetSettingsByName: writePresetSettingsByNameMock,
    findMatchingDerivedPreset: findMatchingDerivedPresetMock,
    createDerivedPreset: createDerivedPresetMock,
    createBasePreset: vi.fn(),
  }),
}))

vi.mock('../src/services/settings-source-service.js', () => ({
  createSettingsSourceService: () => ({
    discoverSettingsSources: vi.fn().mockResolvedValue([]),
  }),
}))

vi.mock('../src/core/spawn.js', () => ({
  spawnClaude: vi.fn().mockResolvedValue(0),
}))

vi.mock('../src/services/plugin-service.js', () => ({
  resolvePluginStates: vi.fn(() => []),
  pluginStatesToEnabledPlugins: vi.fn(() => ({})),
}))

vi.mock('../src/services/skill-service.js', () => ({
  applySkillOverrides: vi.fn((skills) => skills),
  discoverSkillStates: vi.fn().mockResolvedValue([]),
  skillStatesToOverrides: vi.fn(() => ({})),
}))

describe('cli argument behavior', () => {
  it('keeps claude passthrough args while stripping reserved settings', () => {
    expect(sanitizeClaudeArgs(['--resume', 'abc', '--settings=bad.json']).args).toEqual(['--resume', 'abc'])
  })
})

describe('run command', () => {
  beforeEach(() => {
    vi.resetModules()
    renderMock.mockReset()
    listPresetsMock.mockReset()
    deletePresetMock.mockReset()
    writePresetSettingsByNameMock.mockReset()
    findMatchingDerivedPresetMock.mockReset()
    createDerivedPresetMock.mockReset()
  })

  it('writes edited derived presets before launch without creating another derived preset', async () => {
    const basePreset = {
      type: 'base' as const,
      name: 'base',
      fileName: 'base.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }
    const derivedPresetA = {
      type: 'derived' as const,
      name: 'base-work-a',
      parentName: 'base',
      fileName: 'base-work-a.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }
    const derivedPresetB = {
      type: 'derived' as const,
      name: 'base-work-b',
      parentName: 'base',
      fileName: 'base-work-b.json',
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:00:00.000Z',
    }

    listPresetsMock.mockResolvedValue([basePreset, derivedPresetA, derivedPresetB])

    renderMock.mockImplementationOnce((element: React.ReactElement<{ onSubmit: (result: unknown) => void }>) => {
      element.props.onSubmit({
        type: 'launch',
        preset: derivedPresetB,
        plugins: [{ name: 'alpha', enabled: false, source: 'project' }],
        skills: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
        draftsByPreset: {
          'base-work-a': {
            plugins: [{ name: 'alpha', enabled: true, source: 'project' }],
            skills: [{ name: 'personal', enabled: true, source: 'user', toggleable: true }],
          },
          'base-work-b': {
            plugins: [{ name: 'alpha', enabled: false, source: 'project' }],
            skills: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
          },
        },
      })
      return { waitUntilExit: async () => undefined }
    })

    const { main } = await import('../src/cli.js')
    await main(['node', 'cli'])

    expect(writePresetSettingsByNameMock).toHaveBeenCalled()
    expect(createDerivedPresetMock).not.toHaveBeenCalled()
  })
})

describe('manage command', () => {
  beforeEach(() => {
    vi.resetModules()
    renderMock.mockReset()
    listPresetsMock.mockReset()
    deletePresetMock.mockReset()
    writePresetSettingsByNameMock.mockReset()
    findMatchingDerivedPresetMock.mockReset()
    createDerivedPresetMock.mockReset()
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
        element.props.onSubmit({ type: 'delete', preset: basePreset })
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
})
