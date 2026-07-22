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

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g

function stripAnsi(output: string): string {
  return output.replace(ANSI_PATTERN, '')
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

    expect(output).toContain('Current settings: base · /tmp/base.json')
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
    expect(output.replace(/\n/g, '')).toContain(
      'Current settings: very-long-preset-name-that-should-truncate · /tmp/project/.claude/settings/very-long-file-name.json',
    )
  })

  it('shows detected status and omits details without a selected item', () => {
    const detectedOutput = renderToString(
      <TwoColumnSettingsView
        title="Settings"
        help="Preview"
        items={[{ name: 'detected', sourcePath: '/tmp/detected.json', settings: {}, temporary: true }]}
        cursor={0}
      />,
      { columns: 120 },
    )
    const emptyOutput = renderToString(
      <TwoColumnSettingsView title="Settings" help="Preview" items={[]} cursor={0} />,
      { columns: 120 },
    )

    expect(detectedOutput).toContain('Current settings: detected (detected) · /tmp/detected.json')
    expect(emptyOutput).not.toContain('Current settings:')
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

  it('renders an aligned quick settings column with values, sources, and pending marks', () => {
    const output = withStdoutColumns(120, () => renderToString(
      <TwoColumnSettingsView
        title="Settings"
        help="space cycle"
        items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: { model: 'sonnet' } }]}
        cursor={0}
        quickSettings={{
          focus: 'quick-settings',
          cursor: 1,
          modifiedPresetNames: ['base'],
          items: [
            { field: 'defaultMode', label: 'mode', value: 'plan', source: 'preset', touched: false },
            { field: 'effortLevel', label: 'effort', value: 'xhigh', source: 'pending', touched: true },
          ],
        }}
      />,
      { columns: 120 },
    ))
    const plain = stripAnsi(output)

    expect(plain).toContain('Quick Settings')
    expect(plain).toContain('mode: plan [preset]')
    expect(plain).toContain('effort: xhigh [pending] *')
    expect(plain).toContain('base *')
    expect(output.split(/\n/).some(line => (line.match(/╰/g) ?? []).length === 3)).toBe(true)
  })

  it('shows a resident line for the highlighted quick setting and drops the path from the preview title', () => {
    const output = withStdoutColumns(120, () => renderToString(
      <TwoColumnSettingsView
        title="Settings"
        help="space cycle"
        items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: { model: 'sonnet' } }]}
        cursor={0}
        quickSettings={{
          focus: 'presets',
          cursor: 1,
          items: [
            { field: 'defaultMode', label: 'mode', value: 'plan', source: 'preset', touched: false },
            { field: 'effortLevel', label: 'effort', value: 'xhigh', source: 'pending', touched: true },
          ],
        }}
      />,
      { columns: 120 },
    ))

    expect(stripAnsi(output)).toContain('Quick setting: effort: xhigh [pending] *')
    expect(output).toContain('Preview')
    expect(output).not.toContain('/tmp/base.json ┌')
  })

  it('renders max and ultracode effort levels', () => {
    const build = (value: string) => stripAnsi(withStdoutColumns(120, () => renderToString(
      <TwoColumnSettingsView
        title="Settings"
        help="space cycle"
        items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: {} }]}
        cursor={0}
        quickSettings={{
          focus: 'quick-settings',
          cursor: 0,
          items: [{ field: 'effortLevel', label: 'effort', value, source: 'pending', touched: true }],
        }}
      />,
      { columns: 120 },
    )))

    expect(build('max')).toContain('effort: max [pending] *')
    expect(build('ultracode')).toContain('effort: ultracode [pending] *')
  })
})
