import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ManageResult } from '../src/ink/manage-app.js'
import { sanitizeClaudeArgs } from '../src/core/args.js'

const renderMock = vi.fn()
const listPresetsMock = vi.fn()
const deletePresetMock = vi.fn()

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
    syncDerivedPreset: vi.fn(),
    getPresetPath: vi.fn(),
    readPresetSettings: vi.fn().mockResolvedValue({}),
    findMatchingDerivedPreset: vi.fn(),
    createDerivedPreset: vi.fn(),
    createBasePreset: vi.fn(),
  }),
}))

vi.mock('../src/services/settings-source-service.js', () => ({
  createSettingsSourceService: () => ({
    discoverSettingsSources: vi.fn().mockResolvedValue([]),
  }),
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

describe('manage command', () => {
  beforeEach(() => {
    vi.resetModules()
    renderMock.mockReset()
    listPresetsMock.mockReset()
    deletePresetMock.mockReset()
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
