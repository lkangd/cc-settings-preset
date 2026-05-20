import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { ProjectLaunchApp } from '../../src/ink/project-launch-app.js'

function longestLineLength(output: string): number {
  return Math.max(...output.split(/\n/).map(line => line.length))
}

function topBorderLine(output: string): string {
  return output.split(/\n/).find(line => line.startsWith('╭')) ?? ''
}

function withStdoutColumns<T>(columns: number, run: () => T): T {
  const original = process.stdout.columns
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true })
  try {
    return run()
  } finally {
    Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true })
  }
}

describe('ProjectLaunchApp', () => {
  const props = {
    presets: [],
    detected: {
      plugins: [{ name: 'alpha', enabled: true, source: 'user' as const }],
      skills: [{ name: 'personal', enabled: true, source: 'user' as const, toggleable: true }],
      mcps: [{ name: 'github', enabled: true, source: 'project' as const, config: {} }],
    },
    statesByPreset: {},
    onSubmit: vi.fn(),
  }

  it('renders four columns within a narrow terminal width', () => {
    const output = withStdoutColumns(100, () => renderToString(<ProjectLaunchApp {...props} />, { columns: 100 }))

    expect(output).toContain('Detected')
    expect(output).toContain('Plugins')
    expect(output).toContain('Skills')
    expect(output).toContain('MCPs')
  })

  it('expands close to the available terminal width', () => {
    const output = withStdoutColumns(160, () => renderToString(<ProjectLaunchApp {...props} />, { columns: 160 }))

    expect(output).toContain('github')
    expect(longestLineLength(output)).toBeGreaterThanOrEqual(145)
  })

  it('uses equal visible gaps between all four columns', () => {
    const output = withStdoutColumns(160, () => renderToString(<ProjectLaunchApp {...props} />, { columns: 160 }))

    expect((topBorderLine(output).match(/╮ ╭/g) ?? []).length).toBe(3)
  })
})
