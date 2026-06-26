import { asRecord } from '../core/is-plain-object.js'
import { readJsonFile, readJsonFileOrDefault } from '../core/json.js'
import { resolveProjectMcpPath, resolveUserClaudeJsonPath } from '../core/paths.js'
import type { McpPolicyEntry, Settings } from '../core/schema.js'
import { discoverCachedClaudePlugins } from './plugin-cache-service.js'
import { resolvePluginRegistryKey, type PluginState } from './plugin-service.js'

export type McpSource = 'local' | 'project' | 'user' | 'plugin' | 'connector'

export type McpState = {
  name: string
  enabled: boolean
  source: McpSource
  config: unknown
  controlledByPlugin?: string
}

export type McpDiscoveryInput = {
  homeDir: string
  cwd: string
  knownPlugins?: string[]
}

function readMcpServers(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  const servers = (value as { mcpServers?: unknown }).mcpServers
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return {}
  return servers as Record<string, unknown>
}

function sortMcpStates(states: McpState[]): McpState[] {
  return [...states].sort((a, b) => a.name.localeCompare(b.name))
}

async function discoverPluginMcpServers(
  homeDir: string,
  knownPlugins: string[] = [],
): Promise<Array<{ name: string; config: unknown; controlledByPlugin: string }>> {
  const servers: Array<{ name: string; config: unknown; controlledByPlugin: string }> = []

  for (const plugin of await discoverCachedClaudePlugins(homeDir)) {
    const registryKey = resolvePluginRegistryKey(plugin.pluginName, knownPlugins)
    if (!registryKey) continue

    for (const [name, config] of Object.entries(readMcpServers(plugin.manifest))) {
      servers.push({
        name,
        controlledByPlugin: registryKey,
        config: { pluginName: plugin.pluginName, ...asRecord(config) },
      })
    }
  }

  return servers
}

export async function discoverMcpStates(input: McpDiscoveryInput): Promise<McpState[]> {
  const resolved = new Map<string, McpState>()
  const knownPlugins = input.knownPlugins ?? []
  const userClaudePath = resolveUserClaudeJsonPath(input.homeDir)
  const projectMcpPath = resolveProjectMcpPath(input.cwd)
  const [userClaudeJson, projectMcpJson] = await Promise.all([
    readJsonFileOrDefault(userClaudePath, {}),
    readJsonFileOrDefault(projectMcpPath, {}),
  ])

  for (const { name, config, controlledByPlugin } of await discoverPluginMcpServers(input.homeDir, knownPlugins)) {
    resolved.set(name, { name, enabled: true, source: 'plugin', config, controlledByPlugin })
  }

  for (const [name, config] of Object.entries(readMcpServers(userClaudeJson))) {
    resolved.set(name, { name, enabled: true, source: 'user', config })
  }

  for (const [name, config] of Object.entries(readMcpServers(projectMcpJson))) {
    resolved.set(name, { name, enabled: true, source: 'project', config })
  }

  const projectEntry = (userClaudeJson as { projects?: Record<string, unknown> }).projects?.[input.cwd]
  for (const [name, config] of Object.entries(readMcpServers(projectEntry))) {
    resolved.set(name, { name, enabled: true, source: 'local', config })
  }

  return sortMcpStates(Array.from(resolved.values()))
}

export function applyPluginMcpAvailability(states: McpState[], plugins: PluginState[]): McpState[] {
  const pluginEnabled = new Map(plugins.map(plugin => [plugin.name, plugin.enabled]))
  return sortMcpStates(states.map(state => {
    if (!state.controlledByPlugin) return state
    if (pluginEnabled.get(state.controlledByPlugin) === false) {
      return { ...state, enabled: false }
    }
    return state
  }))
}

export function syncMcpsWithPlugins(plugins: PluginState[], mcps: McpState[]): McpState[] {
  return applyPluginMcpAvailability(mcps, plugins)
}

export function resolveDeniedMcpServers(sources: Array<{ settings: Settings }>): McpPolicyEntry[] {
  const seenServerNames = new Set<string>()
  const denied: McpPolicyEntry[] = []

  for (const source of sources) {
    for (const entry of source.settings.deniedMcpServers ?? []) {
      if ('serverName' in entry) {
        if (seenServerNames.has(entry.serverName)) continue
        seenServerNames.add(entry.serverName)
        denied.push(entry)
        continue
      }
      denied.push(entry)
    }
  }

  return denied
}

export function applyDeniedMcpServers(states: McpState[], denied: McpPolicyEntry[] = []): McpState[] {
  const deniedNames = new Set(denied.flatMap(entry => 'serverName' in entry ? [entry.serverName] : []))
  if (deniedNames.size === 0) return sortMcpStates(states)
  return sortMcpStates(states.map(state => (
    deniedNames.has(state.name) ? { ...state, enabled: false } : state
  )))
}

export function mcpStatesToDeniedServers(states: McpState[]): McpPolicyEntry[] {
  return states
    .filter(state => !state.enabled)
    .map(state => ({ serverName: state.name }))
}
