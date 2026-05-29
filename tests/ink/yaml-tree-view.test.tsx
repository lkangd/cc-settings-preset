import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { YamlTreeView } from '../../src/ink/components/yaml-tree-view.js'

function plain(node: React.ReactElement): string[] {
  const output = renderToString(node, { columns: 120 })
  return output
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
}

describe('YamlTreeView', () => {
  it('renders nested mappings and string sequences as indented yaml', () => {
    const lines = plain(
      <YamlTreeView
        value={{
          env: { ANTHROPIC_MODEL: 'opus' },
          permissions: { allow: ['Bash(ls)', 'Read(*)'] },
        }}
      />,
    )

    expect(lines).toEqual([
      'env:',
      '  ANTHROPIC_MODEL: opus',
      'permissions:',
      '  allow:',
      '    - Bash(ls)',
      '    - Read(*)',
    ])
  })

  it('renders an array of objects with dash markers', () => {
    const lines = plain(<YamlTreeView value={{ deniedMcpServers: [{ serverName: 'github' }] }} />)

    expect(lines).toEqual([
      'deniedMcpServers:',
      '  - serverName: github',
    ])
  })

  it('quotes ambiguous scalars and renders booleans, numbers, null', () => {
    const lines = plain(
      <YamlTreeView
        value={{
          empty: '',
          looksBool: 'true',
          url: 'https://example.com',
          flag: false,
          count: 3,
          missing: null,
        }}
      />,
    )

    expect(lines).toEqual([
      'empty: ""',
      'looksBool: "true"',
      'url: https://example.com',
      'flag: false',
      'count: 3',
      'missing: null',
    ])
  })
})
