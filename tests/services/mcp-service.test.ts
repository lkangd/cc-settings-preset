import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { discoverMcpStates, mcpStatesToDeniedServers } from '../../src/services/mcp-service.js'

describe('discoverMcpStates', () => {
  it('discovers local, project, user, and plugin MCP servers with precedence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-mcp-'))
    const homeDir = join(root, 'home')
    const cwd = join(root, 'repo')
    await mkdir(join(homeDir, '.claude', 'plugins', 'cache', 'vendor', 'plugin-a'), { recursive: true })
    await mkdir(cwd, { recursive: true })

    await writeFile(join(homeDir, '.claude.json'), JSON.stringify({
      mcpServers: {
        shared: { type: 'http', url: 'https://user.example/mcp' },
        userOnly: { command: 'node', args: ['user.js'] },
      },
      projects: {
        [cwd]: {
          mcpServers: {
            shared: { type: 'http', url: 'https://local.example/mcp' },
            localOnly: { command: 'node', args: ['local.js'] },
          },
        },
      },
    }), 'utf8')

    await writeFile(join(cwd, '.mcp.json'), JSON.stringify({
      mcpServers: {
        shared: { type: 'http', url: 'https://project.example/mcp' },
        projectOnly: { command: 'node', args: ['project.js'] },
      },
    }), 'utf8')

    await writeFile(join(homeDir, '.claude', 'plugins', 'cache', 'vendor', 'plugin-a', 'plugin.json'), JSON.stringify({
      name: 'plugin-a',
      mcpServers: {
        pluginOnly: { command: 'node', args: ['plugin.js'] },
        userOnly: { command: 'node', args: ['plugin-user.js'] },
      },
    }), 'utf8')

    const states = await discoverMcpStates({ homeDir, cwd })

    expect(states.map(state => [state.name, state.source, state.enabled])).toEqual([
      ['localOnly', 'local', true],
      ['pluginOnly', 'plugin', true],
      ['projectOnly', 'project', true],
      ['shared', 'local', true],
      ['userOnly', 'user', true],
    ])
  })

  it('converts disabled MCP states to deniedMcpServers entries', () => {
    expect(mcpStatesToDeniedServers([
      { name: 'github', enabled: false, source: 'project', config: {} },
      { name: 'filesystem', enabled: true, source: 'user', config: {} },
    ])).toEqual([{ serverName: 'github' }])
  })
})
