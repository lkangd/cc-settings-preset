import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { ManageApp } from '../../src/ink/manage-app.js'

describe('ManageApp', () => {
  it('renders global settings presets with JSON preview', () => {
    const output = renderToString(
      <ManageApp
        items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: { enabledPlugins: { alpha: true } } }]}
        onSubmit={vi.fn()}
      />,
      { columns: 120 },
    )

    expect(output).toContain('Manage settings presets')
    expect(output).toContain('base')
    expect(output).toContain('enabledPlugins')
  })
})
