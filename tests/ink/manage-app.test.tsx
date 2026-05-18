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
  })
})
