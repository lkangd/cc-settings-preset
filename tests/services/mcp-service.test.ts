import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  applyDeniedMcpServers,
  applyPluginMcpAvailability,
  discoverMcpStates,
  mcpStatesToDeniedServers,
  resolveDeniedMcpServers,
} from '../../src/services/mcp-service.js'

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

    const states = await discoverMcpStates({ homeDir, cwd, knownPlugins: ['plugin-a'] })

    expect(states.map(state => [state.name, state.source, state.enabled, state.controlledByPlugin])).toEqual([
      ['localOnly', 'local', true, undefined],
      ['pluginOnly', 'plugin', true, 'plugin-a'],
      ['projectOnly', 'project', true, undefined],
      ['shared', 'local', true, undefined],
      ['userOnly', 'user', true, undefined],
    ])
  })

  it('ignores plugin MCP servers when the plugin is not in the detected plugin list', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-mcp-'))
    const homeDir = join(root, 'home')
    const cwd = join(root, 'repo')
    await mkdir(join(homeDir, '.claude', 'plugins', 'cache', 'vendor', 'plugin-a'), { recursive: true })
    await mkdir(cwd, { recursive: true })

    await writeFile(join(homeDir, '.claude', 'plugins', 'cache', 'vendor', 'plugin-a', 'plugin.json'), JSON.stringify({
      name: 'plugin-a',
      mcpServers: {
        pluginOnly: { command: 'node', args: ['plugin.js'] },
      },
    }), 'utf8')

    expect(await discoverMcpStates({ homeDir, cwd, knownPlugins: [] })).toEqual([])
    expect(await discoverMcpStates({ homeDir, cwd, knownPlugins: ['other-plugin@market'] })).toEqual([])
  })

  it('matches plugin MCP servers using registry keys with marketplace suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-mcp-'))
    const homeDir = join(root, 'home')
    const cwd = join(root, 'repo')
    await mkdir(join(homeDir, '.claude', 'plugins', 'cache', 'vendor', 'plugin-a'), { recursive: true })
    await mkdir(cwd, { recursive: true })

    await writeFile(join(homeDir, '.claude', 'plugins', 'cache', 'vendor', 'plugin-a', 'plugin.json'), JSON.stringify({
      name: 'plugin-a',
      mcpServers: {
        pluginOnly: { command: 'node', args: ['plugin.js'] },
      },
    }), 'utf8')

    const states = await discoverMcpStates({
      homeDir,
      cwd,
      knownPlugins: ['plugin-a@vendor'],
    })

    expect(states).toEqual([
      {
        name: 'pluginOnly',
        enabled: true,
        source: 'plugin',
        config: { pluginName: 'plugin-a', command: 'node', args: ['plugin.js'] },
        controlledByPlugin: 'plugin-a@vendor',
      },
    ])
  })
})

describe('applyPluginMcpAvailability', () => {
  it('disables plugin MCP servers when the parent plugin is off', () => {
    const states = applyPluginMcpAvailability([
      { name: 'pluginOnly', enabled: true, source: 'plugin', config: {}, controlledByPlugin: 'plugin-a@vendor' },
      { name: 'context7', enabled: true, source: 'user', config: {} },
    ], [
      { name: 'plugin-a@vendor', enabled: false, source: 'user' },
    ])

    expect(states).toEqual([
      { name: 'context7', enabled: true, source: 'user', config: {} },
      { name: 'pluginOnly', enabled: false, source: 'plugin', config: {}, controlledByPlugin: 'plugin-a@vendor' },
    ])
  })
})

describe('resolveDeniedMcpServers', () => {
  it('merges deniedMcpServers across settings sources', () => {
    expect(resolveDeniedMcpServers([
      { settings: { deniedMcpServers: [{ serverName: 'github' }] } },
      { settings: { deniedMcpServers: [{ serverName: 'chrome-devtools' }, { serverName: 'github' }] } },
    ])).toEqual([
      { serverName: 'github' },
      { serverName: 'chrome-devtools' },
    ])
  })
})

describe('applyDeniedMcpServers', () => {
  it('only disables listed servers and preserves baseline when denied list is empty', () => {
    const baseline = [
      { name: 'chrome-devtools', enabled: false, source: 'user' as const, config: {} },
      { name: 'github', enabled: true, source: 'project' as const, config: {} },
    ]

    expect(applyDeniedMcpServers(baseline, [])).toEqual(baseline)
    expect(applyDeniedMcpServers(baseline, [{ serverName: 'github' }])).toEqual([
      { name: 'chrome-devtools', enabled: false, source: 'user', config: {} },
      { name: 'github', enabled: false, source: 'project', config: {} },
    ])
  })
})

describe('mcpStatesToDeniedServers', () => {
  it('converts disabled MCP states to deniedMcpServers entries', () => {
    expect(mcpStatesToDeniedServers([
      { name: 'github', enabled: false, source: 'project', config: {} },
      { name: 'filesystem', enabled: true, source: 'user', config: {} },
    ])).toEqual([{ serverName: 'github' }])
  })
})
