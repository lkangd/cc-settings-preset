import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { ProjectLaunchApp } from '../../src/ink/project-launch-app.js'

describe('ProjectLaunchApp', () => {
  it('renders Detected, plugins, skills, and MCP columns', () => {
    const output = renderToString(
      <ProjectLaunchApp
        presets={[]}
        detected={{
          plugins: [{ name: 'alpha', enabled: true, source: 'user' }],
          skills: [{ name: 'personal', enabled: true, source: 'user', toggleable: true }],
          mcps: [{ name: 'github', enabled: true, source: 'project', config: {} }],
        }}
        statesByPreset={{}}
        onSubmit={vi.fn()}
      />,
      { columns: 140 },
    )

    expect(output).toContain('Detected')
    expect(output).toContain('Plugins')
    expect(output).toContain('Skills')
    expect(output).toContain('MCPs')
    expect(output).toContain('github')
  })
})
