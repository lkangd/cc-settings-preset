import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { TwoColumnSettingsView } from '../../src/ink/components/two-column-settings-view.js'

function withStdoutColumns<T>(columns: number, run: () => T): T {
  const original = process.stdout.columns
  Object.defineProperty(process.stdout, 'columns', { value: columns, configurable: true })
  try {
    return run()
  } finally {
    Object.defineProperty(process.stdout, 'columns', { value: original, configurable: true })
  }
}

function bottomBorderLine(output: string): string {
  return output.split(/\n/).find(line => (line.match(/╰/g) ?? []).length === 2) ?? ''
}

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

  it('truncates long labels instead of wrapping them', () => {
    const output = withStdoutColumns(60, () => renderToString(
      <TwoColumnSettingsView
        title="Very long title for truncation"
        help="Very long help text that should not wrap in a narrow terminal"
        items={[
          {
            name: 'very-long-preset-name-that-should-truncate',
            sourcePath: '/tmp/project/.claude/settings/very-long-file-name.json',
            settings: { permissions: { allow: ['Read(*)'] } },
          },
        ]}
        cursor={0}
      />,
      { columns: 60 },
    ))

    expect(output).toContain('…')
  })

  it('truncates long JSON preview values instead of wrapping them', () => {
    const longValue = 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz'
    const output = withStdoutColumns(60, () => renderToString(
      <TwoColumnSettingsView
        title="Settings"
        help="Preview"
        items={[
          {
            name: 'base',
            sourcePath: '/tmp/project/.claude/settings.json',
            settings: { longKey: longValue },
          },
        ]}
        cursor={0}
      />,
      { columns: 60 },
    ))

    expect(output).not.toContain(longValue)
  })

  it('keeps both column bottoms aligned when preview is taller', () => {
    const output = withStdoutColumns(100, () => renderToString(
      <TwoColumnSettingsView
        title="Settings"
        help="Preview"
        items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: { env: { TOKEN: 'a', URL: 'b', PORT: 1 } } }]}
        cursor={0}
      />,
      { columns: 100 },
    ))

    expect((bottomBorderLine(output).match(/╰/g) ?? []).length).toBe(2)
  })

  it('keeps both column bottoms aligned when settings list is taller', () => {
    const output = withStdoutColumns(100, () => renderToString(
      <TwoColumnSettingsView
        title="Settings"
        help="Preview"
        items={[
          { name: 'base', sourcePath: '/tmp/base.json', settings: { model: 'sonnet' } },
          { name: 'work', sourcePath: '/tmp/work.json', settings: { model: 'opus' } },
          { name: 'mini', sourcePath: '/tmp/mini.json', settings: { model: 'haiku' } },
          { name: 'env-only', sourcePath: '/tmp/env.json', settings: { model: 'gpt' } },
        ]}
        cursor={0}
      />,
      { columns: 100 },
    ))

    expect((bottomBorderLine(output).match(/╰/g) ?? []).length).toBe(2)
  })
})
