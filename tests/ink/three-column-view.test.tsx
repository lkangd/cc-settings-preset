import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'

import { ThreeColumnView } from '../../src/ink/components/three-column-view.js'

describe('three-column view', () => {
  it('counts enabled skills and plugins from resolved state', () => {
    const output = renderToString(
      <ThreeColumnView
        title="Manage settings presets"
        help="help"
        presets={[
          { type: 'base', name: 'base-a', fileName: 'base-a.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        ]}
        plugins={[
          { name: 'alpha', enabled: false, source: 'project' },
          { name: 'beta', enabled: true, source: 'user' },
        ]}
        skills={[
          { name: 'personal', enabled: false, source: 'user', toggleable: true },
          { name: 'project', enabled: true, source: 'project', toggleable: true },
        ]}
        focus="settings"
        settingsCursor={0}
        pluginCursor={0}
        skillCursor={0}
      />,
      { columns: 120 },
    )

    expect(output).toContain('Plugins(1/2)')
    expect(output).toContain('Skills(1/2)')
    expect(output).toContain('OFF')
  })

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
        plugins={[
          { name: 'alpha-plugin', enabled: true, source: 'user' },
          { name: 'beta-plugin', enabled: false, source: 'project-local' },
        ]}
        skills={[
          { name: 'archive', enabled: true, source: 'command', toggleable: true },
          { name: 'demo-plugin:sync', enabled: true, source: 'plugin', toggleable: false, controlledByPlugin: 'demo-plugin' },
          { name: 'legacy-skill', enabled: false, source: 'project', toggleable: true },
        ]}
        focus="settings"
        settingsCursor={1}
        pluginCursor={0}
        skillCursor={0}
        sortMode="name"
      />,
      { columns: 120 },
    )

    expect(output).toContain('❯   └─ derived-a1')
    expect(output).toContain('    └─ derived-a2')
    expect(output).not.toContain('derived-a1 (derived)')
    expect(output).toContain('Settings(2)')
    expect(output).toContain('Plugins(1/2) · A-Z')
    expect(output).toContain('Skills(2/3) · A-Z')
    expect(output).toContain('[U] alpha-plugin')
    expect(output).toContain('[L] beta-plugin')
    expect(output).toContain('[C] archive')
    expect(output).toContain('[PL] demo-plugin:sync (plugin)')
    expect(output).toContain('[P] legacy-skill')
  })
})
