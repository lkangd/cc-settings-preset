import { promises as fs, type Dirent } from 'node:fs'
import { basename, join } from 'node:path'
import { pathExists, readJsonFile } from '../core/json.js'
import { resolveClaudePluginCacheDir, resolveProjectMcpPath, resolveUserClaudeJsonPath } from '../core/paths.js'
import type { McpPolicyEntry, Settings } from '../core/schema.js'

export type McpSource = 'local' | 'project' | 'user' | 'plugin' | 'connector'

export type McpState = {
  name: string
  enabled: boolean
  source: McpSource
  config: unknown
}

export type McpDiscoveryInput = {
  homeDir: string
  cwd: string
}

async function readDirSafe(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
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

async function discoverPluginMcpServers(homeDir: string): Promise<Array<{ name: string; config: unknown }>> {
  const cacheDir = resolveClaudePluginCacheDir(homeDir)
  const servers: Array<{ name: string; config: unknown }> = []

  async function scan(dirPath: string): Promise<void> {
    const entries = await readDirSafe(dirPath)

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = join(dirPath, entry.name)
      const manifestPath = join(fullPath, 'plugin.json')

      if (await pathExists(manifestPath)) {
        const manifest = await readJsonFile(manifestPath)
        const pluginName = typeof (manifest as { name?: unknown }).name === 'string'
          ? (manifest as { name: string }).name
          : basename(fullPath)
        for (const [name, config] of Object.entries(readMcpServers(manifest))) {
          servers.push({ name, config: { pluginName, ...asRecord(config) } })
        }
        continue
      }

      await scan(fullPath)
    }
  }

  await scan(cacheDir)
  return servers
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export async function discoverMcpStates(input: McpDiscoveryInput): Promise<McpState[]> {
  const resolved = new Map<string, McpState>()
  const userClaudePath = resolveUserClaudeJsonPath(input.homeDir)
  const userClaudeJson = await pathExists(userClaudePath) ? await readJsonFile(userClaudePath) : {}
  const projectMcpPath = resolveProjectMcpPath(input.cwd)
  const projectMcpJson = await pathExists(projectMcpPath) ? await readJsonFile(projectMcpPath) : {}

  for (const { name, config } of await discoverPluginMcpServers(input.homeDir)) {
    resolved.set(name, { name, enabled: true, source: 'plugin', config })
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
  return sortMcpStates(states.map(state => ({ ...state, enabled: !deniedNames.has(state.name) })))
}

export function mcpStatesToDeniedServers(states: McpState[]): McpPolicyEntry[] {
  return states
    .filter(state => !state.enabled)
    .map(state => ({ serverName: state.name }))
}
