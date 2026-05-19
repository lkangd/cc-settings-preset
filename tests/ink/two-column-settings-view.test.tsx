import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { TwoColumnSettingsView } from '../../src/ink/components/two-column-settings-view.js'

describe('TwoColumnSettingsView', () => {
  it('renders settings names and JSON tree values', () => {
    const output = renderToString(
      <TwoColumnSettingsView
        title="Select settings"
        help="enter select"
        items={[{ name: 'base', settings: { enabledPlugins: { alpha: true } }, sourcePath: '/tmp/base.json' }]}
        cursor={0}
      />,
      { columns: 120 },
    )

    expect(output).toContain('base')
    expect(output).toContain('enabledPlugins')
    expect(output).toContain('alpha')
    expect(output).toContain('true')
  })
})
