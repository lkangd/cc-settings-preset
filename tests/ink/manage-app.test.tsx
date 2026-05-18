import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'

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
})
