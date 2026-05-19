import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it, vi } from 'vitest'

import { ManageApp } from '../../src/ink/manage-app.js'
import { RunApp } from '../../src/ink/run-app.js'

describe('run app', () => {
  it('does not show the derived-preset hint when only a derived preset has a draft', () => {
    const output = renderToString(
      <RunApp
        presets={[
          { type: 'base', name: 'base', fileName: 'base.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
          { type: 'derived', name: 'base-work', parentName: 'base', fileName: 'base-work.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          base: [{ name: 'alpha', enabled: true, source: 'user' }],
          'base-work': [{ name: 'alpha', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          base: [{ name: 'personal', enabled: true, source: 'user', toggleable: true }],
          'base-work': [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
        }}
        onSubmit={() => undefined}
      />,
      { columns: 120 },
    )

    expect(output).not.toContain('Changes will create or reuse a derived preset.')
  })
})

describe('manage app', () => {
  it('shows plugin and skill state for the currently selected preset', () => {
    const output = renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'alpha', fileName: 'alpha-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          alpha: [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          alpha: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
        }}
        onSubmit={() => undefined}
      />,
      { columns: 120 },
    )

    expect(output).toContain('Plugins(0/1)')
    expect(output).toContain('Skills(0/1)')
    expect(output).toContain('OFF')
    expect(output).toContain('[P] demo')
  })

  it('renders preset-disabled plugins as OFF while keeping their ownership badge', () => {
    const output = renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'test', fileName: 'test-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          test: [
            { name: 'commit-commands@coding-agent-skills', enabled: false, source: 'user' },
            { name: 'superpowers@claude-plugins-official', enabled: false, source: 'project' },
            { name: 'typescript-lsp@claude-plugins-official', enabled: false, source: 'project' },
          ],
        }}
        skillsByPreset={{
          test: [],
        }}
        onSubmit={() => undefined}
      />,
      { columns: 140 },
    )

    expect(output).toContain('Plugins(0/3)')
    expect(output).toContain('OFF')
    expect(output).toContain('[U] commit-commands')
    expect(output).toContain('[P] superpowers')
    expect(output).toContain('[P] typescript-lsp')
  })

  it('shows a no changes to save message when enter is pressed without a draft', () => {
    const output = renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'alpha', fileName: 'alpha-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          alpha: [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          alpha: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
        }}
        onSubmit={() => undefined}
        initialDebugActions={[{ input: '', key: { return: true } }]}
      />,
      { columns: 120 },
    )

    expect(output).toContain('no changes to save')
  })

  it('submits a save result when enter is pressed with a base preset draft', () => {
    const onSubmit = vi.fn()

    renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'alpha', fileName: 'alpha-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          alpha: [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          alpha: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
        }}
        onSubmit={onSubmit}
        initialDebugActions={[
          { input: 'p' },
          { input: ' ' },
          { input: '', key: { return: true } },
        ]}
      />,
      { columns: 120 },
    )

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'save',
      preset: expect.objectContaining({ name: 'alpha' }),
      plugins: [{ name: 'demo', enabled: true, source: 'project' }],
      skills: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
    })
  })

  it('opens save confirmation before saving a modified derived preset', () => {
    const onSubmit = vi.fn()

    const output = renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'base', fileName: 'base.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
          { type: 'derived', name: 'base-work', parentName: 'base', fileName: 'base-work.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          base: [{ name: 'demo', enabled: true, source: 'project' }],
          'base-work': [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          base: [{ name: 'personal', enabled: true, source: 'user', toggleable: true }],
          'base-work': [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
        }}
        onSubmit={onSubmit}
        initialDebugActions={[
          { input: 'j' },
          { input: 'p' },
          { input: ' ' },
          { input: '', key: { return: true } },
        ]}
      />,
      { columns: 120 },
    )

    expect(output).toContain('Save changes to affected presets?')
    expect(output).toContain('base-work')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('saves a modified derived preset after confirming save', () => {
    const onSubmit = vi.fn()

    renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'base', fileName: 'base.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
          { type: 'derived', name: 'base-work', parentName: 'base', fileName: 'base-work.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          base: [{ name: 'demo', enabled: true, source: 'project' }],
          'base-work': [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          base: [{ name: 'personal', enabled: true, source: 'user', toggleable: true }],
          'base-work': [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
        }}
        onSubmit={onSubmit}
        initialDebugActions={[
          { input: 'j' },
          { input: 'p' },
          { input: ' ' },
          { input: '', key: { return: true } },
          { input: '', key: { return: true } },
        ]}
      />,
      { columns: 120 },
    )

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'save',
      preset: expect.objectContaining({ name: 'base-work' }),
      plugins: [{ name: 'demo', enabled: true, source: 'project' }],
      skills: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
    })
  })

  it('submits save then launch when l is pressed on settings with a draft', () => {
    const onSubmit = vi.fn()

    renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'alpha', fileName: 'alpha-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          alpha: [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          alpha: [],
        }}
        onSubmit={onSubmit}
        initialDebugActions={[
          { input: 'p' },
          { input: ' ' },
          { input: 'h' },
          { input: 'l' },
        ]}
      />,
      { columns: 120 },
    )

    expect(onSubmit.mock.calls).toEqual([
      [{
        type: 'save',
        preset: expect.objectContaining({ name: 'alpha' }),
        plugins: [{ name: 'demo', enabled: true, source: 'project' }],
        skills: [],
      }],
      [{
        type: 'launch',
        preset: expect.objectContaining({ name: 'alpha' }),
      }],
    ])
  })

  it('uses l as focus-right when settings is not focused', () => {
    const output = renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'alpha', fileName: 'alpha-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          alpha: [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          alpha: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
        }}
        onSubmit={() => undefined}
        initialDebugActions={[{ input: 'p' }, { input: 'l' }]}
      />,
      { columns: 120 },
    )

    expect(output).toContain('❯ OFF [U] personal')
  })

  it('saves first and then opens rename when r is pressed with unsaved derived changes', () => {
    const onSubmit = vi.fn()

    const output = renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'base', fileName: 'base.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
          { type: 'derived', name: 'base-work', parentName: 'base', fileName: 'base-work.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          base: [{ name: 'demo', enabled: true, source: 'project' }],
          'base-work': [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          base: [{ name: 'personal', enabled: true, source: 'user', toggleable: true }],
          'base-work': [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
        }}
        onSubmit={onSubmit}
        initialDebugActions={[
          { input: 'j' },
          { input: 'p' },
          { input: ' ' },
          { input: 'r' },
          { input: '', key: { return: true } },
        ]}
      />,
      { columns: 120 },
    )

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'save',
      preset: expect.objectContaining({ name: 'base-work' }),
      plugins: [{ name: 'demo', enabled: true, source: 'project' }],
      skills: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
    })
    expect(output).toContain('Rename base-work to')
  })

  it('goes straight to delete confirmation when d is pressed with unsaved changes', () => {
    const output = renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'alpha', fileName: 'alpha-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          alpha: [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          alpha: [],
        }}
        onSubmit={() => undefined}
        initialDebugActions={[{ input: 'p' }, { input: ' ' }, { input: 'd' }]}
      />,
      { columns: 120 },
    )

    expect(output).toContain('Delete preset alpha?')
    expect(output).not.toContain('save or discard changes before rename/delete')
  })

  it('keeps skills ordered by status after saving plugin changes', () => {
    const output = renderToString(
      <ManageApp
        presets={[
          { type: 'base', name: 'alpha', fileName: 'alpha-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        pluginsByPreset={{
          alpha: [{ name: 'demo', enabled: false, source: 'project' }],
        }}
        skillsByPreset={{
          alpha: [
            { name: 'enabled-skill', enabled: true, source: 'user', toggleable: true },
            { name: 'disabled-skill', enabled: false, source: 'project', toggleable: true },
          ],
        }}
        onSubmit={() => undefined}
        initialDebugActions={[
          { input: 'p' },
          { input: ' ' },
          { input: '', key: { return: true } },
        ]}
      />,
      { columns: 120 },
    )

    expect(output.indexOf('enabled-skill')).toBeLessThan(output.indexOf('disabled-skill'))
  })

})
