import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { ProjectManageApp } from '../../src/ink/project-manage-app.js'

function longestLineLength(output: string): number {
  return Math.max(...output.split(/\n/).map(line => line.length))
}

function topBorderLine(output: string): string {
  return output.split(/\n/).find(line => line.startsWith('╭') || line.startsWith('┌')) ?? ''
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

describe('ProjectManageApp', () => {
  const props = {
    presets: [{ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }],
    detected: { plugins: [], skills: [], mcps: [] },
    statesByPreset: { web: { plugins: [], skills: [], mcps: [] } },
    onSubmit: vi.fn(),
  }

  it('renders management columns within a narrow terminal width', () => {
    const output = withStdoutColumns(100, () => renderToString(<ProjectManageApp {...props} />, { columns: 100 }))

    expect(output).toContain('Manage project launch presets')
    expect(output).toContain('Presets')
    expect(output).toContain('Plugins')
    expect(output).toContain('Skills')
    expect(output).toContain('MCPs')
  })

  it('keeps the management layout at least 90 columns wide in very narrow terminals', () => {
    const output = withStdoutColumns(60, () => renderToString(<ProjectManageApp {...props} />, { columns: 60 }))

    expect(longestLineLength(output)).toBeGreaterThanOrEqual(85)
  })

  it('expands close to the available terminal width', () => {
    const output = withStdoutColumns(160, () => renderToString(<ProjectManageApp {...props} />, { columns: 160 }))

    expect(output).toContain('r rename')
    expect(output).toContain('d delete')
    expect(longestLineLength(output)).toBeGreaterThanOrEqual(145)
  })

  it('uses equal visible gaps between all four columns', () => {
    const output = withStdoutColumns(160, () => renderToString(<ProjectManageApp {...props} />, { columns: 160 }))

    expect((topBorderLine(output).match(/[╮┐] [╭┌]/g) ?? []).length).toBe(3)
  })

  it('truncates long management labels instead of wrapping them', () => {
    const output = withStdoutColumns(90, () => renderToString(
      <ProjectManageApp
        presets={[]}
        detected={{
          plugins: [{ name: 'plugin-name-that-is-far-too-long-for-the-column', enabled: true, source: 'user' }],
          skills: [{ name: 'skill-name-that-is-far-too-long-for-the-column', enabled: true, source: 'user', toggleable: true }],
          mcps: [{ name: 'mcp-server-name-that-is-far-too-long-for-the-column', enabled: true, source: 'project', config: {} }],
        }}
        statesByPreset={{}}
        onSubmit={vi.fn()}
      />,
      { columns: 90 },
    ))

    expect(output).toContain('…')
  })
})
