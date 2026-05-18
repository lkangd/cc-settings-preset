import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'

import { ManageApp } from '../../src/ink/manage-app.js'

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
