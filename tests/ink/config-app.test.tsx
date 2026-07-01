import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it, vi } from 'vitest'
import { ConfigApp } from '../../src/ink/config-app.js'

function withStdoutColumns<T>(columns: number, run: () => T): T {
  const original = process.stdout.columns
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true })
  try {
    return run()
  } finally {
    Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true })
  }
}

describe('ConfigApp', () => {
  const initialConfig = {
    globalPresetEnvOnly: true,
    statusLineEnabled: true,
    settingsDisplayFormat: 'yaml' as const,
    runMode: 'both' as const,
    bannerEnabled: true,
  }

  it('renders the config list and description panel', () => {
    const output = withStdoutColumns(100, () => renderToString(
      <ConfigApp initialConfig={initialConfig} onChange={vi.fn()} />,
      { columns: 100 },
    ))

    expect(output).toContain('Global preset env-only')
    expect(output).toContain('When enabled')
  })
})
