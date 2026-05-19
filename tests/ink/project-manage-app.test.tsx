import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { ProjectManageApp } from '../../src/ink/project-manage-app.js'

describe('ProjectManageApp', () => {
  it('renders project launch presets with management help', () => {
    const output = renderToString(
      <ProjectManageApp
        presets={[{ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }]}
        detected={{ plugins: [], skills: [], mcps: [] }}
        statesByPreset={{ web: { plugins: [], skills: [], mcps: [] } }}
        onSubmit={vi.fn()}
      />,
      { columns: 140 },
    )

    expect(output).toContain('Manage project launch presets')
    expect(output).toContain('r rename')
    expect(output).toContain('d delete')
  })
})
