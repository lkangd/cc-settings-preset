import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'

import { ThreeColumnView } from '../../src/ink/components/three-column-view.js'

describe('three-column view', () => {
  it('renders derived presets as a tree under their base preset', () => {
    const output = renderToString(
      <ThreeColumnView
        title="Run settings presets"
        help="help"
        presets={[
          { type: 'base', name: 'base-a', fileName: 'base-a.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
          { type: 'derived', name: 'derived-a1', parentName: 'base-a', fileName: 'derived-a1.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
          { type: 'derived', name: 'derived-a2', parentName: 'base-a', fileName: 'derived-a2.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
          { type: 'base', name: 'base-b', fileName: 'base-b.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        plugins={[]}
        skills={[]}
        focus="settings"
        settingsCursor={1}
        pluginCursor={0}
        skillCursor={0}
      />,
      { columns: 120 },
    )

    expect(output).toContain('❯   └─ derived-a1')
    expect(output).toContain('    └─ derived-a2')
    expect(output).not.toContain('derived-a1 (derived)')
  })
})
