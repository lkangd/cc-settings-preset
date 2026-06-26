import type { Dirent } from 'node:fs'
import { basename, join } from 'node:path'

import { readDirSafe } from '../core/fs.js'
import { asRecord } from '../core/is-plain-object.js'
import { readJsonFile, readJsonFileOrDefault } from '../core/json.js'
import { resolveClaudePluginCacheDir } from '../core/paths.js'

export type CachedClaudePlugin = {
  pluginName: string
  manifest: Record<string, unknown>
  skillNames: string[]
}

const pluginDiscoveryCache = new Map<string, Promise<CachedClaudePlugin[]>>()

function hasFile(entries: Dirent[], fileName: string): boolean {
  return entries.some(entry => entry.isFile() && entry.name === fileName)
}

function hasDirectory(entries: Dirent[], dirName: string): boolean {
  return entries.some(entry => entry.isDirectory() && entry.name === dirName)
}

function hasManifestLikeEntry(entries: Dirent[]): boolean {
  return hasFile(entries, 'plugin.json') || hasFile(entries, 'package.json')
}

function hasPluginMarker(entries: Dirent[]): boolean {
  return hasManifestLikeEntry(entries) || hasFile(entries, '.mcp.json') || hasDirectory(entries, 'skills')
}

async function discoverSkillNames(pluginPath: string): Promise<string[]> {
  const skillEntries = await readDirSafe(join(pluginPath, 'skills'))
  const skillNames: string[] = []

  for (const skillEntry of skillEntries) {
    if (!skillEntry.isDirectory()) continue
    const files = await readDirSafe(join(pluginPath, 'skills', skillEntry.name))
    if (hasFile(files, 'SKILL.md')) {
      skillNames.push(skillEntry.name)
    }
  }

  return skillNames
}

async function readManifest(candidatePath: string, entries: Dirent[]): Promise<Record<string, unknown>> {
  if (hasFile(entries, 'plugin.json')) {
    return asRecord(await readJsonFile(join(candidatePath, 'plugin.json')))
  }

  if (hasFile(entries, 'package.json')) {
    return asRecord(await readJsonFile(join(candidatePath, 'package.json')))
  }

  return {}
}

async function mergeMcpServersIntoManifest(
  candidatePath: string,
  manifest: Record<string, unknown>,
  entries: Dirent[],
): Promise<Record<string, unknown>> {
  if ('mcpServers' in manifest && manifest.mcpServers && typeof manifest.mcpServers === 'object' && !Array.isArray(manifest.mcpServers)) {
    return manifest
  }

  if (!hasFile(entries, '.mcp.json')) return manifest

  try {
    const raw = await readJsonFileOrDefault(join(candidatePath, '.mcp.json'), undefined)
    const mcpConfig = asRecord(raw)
    const mcpServers = asRecord(mcpConfig.mcpServers)
    if (Object.keys(mcpServers).length === 0) return manifest
    return { ...manifest, mcpServers }
  } catch {
    return manifest
  }
}

async function readPluginCandidate(candidatePath: string, fallbackPluginName: string): Promise<CachedClaudePlugin | undefined> {
  const entries = await readDirSafe(candidatePath)
  if (!hasPluginMarker(entries)) return undefined

  const skillNames = hasDirectory(entries, 'skills') ? await discoverSkillNames(candidatePath) : []
  let manifest: Record<string, unknown> = {}
  try {
    manifest = await mergeMcpServersIntoManifest(candidatePath, await readManifest(candidatePath, entries), entries)
  } catch {
    if (skillNames.length === 0) return undefined
  }

  return {
    pluginName: typeof manifest.name === 'string' ? manifest.name : fallbackPluginName,
    manifest,
    skillNames,
  }
}

async function discoverPluginCandidates(pluginRootPath: string): Promise<CachedClaudePlugin[]> {
  const rootEntries = await readDirSafe(pluginRootPath)
  const fallbackPluginName = basename(pluginRootPath)

  if (hasPluginMarker(rootEntries)) {
    const plugin = await readPluginCandidate(pluginRootPath, fallbackPluginName)
    return plugin ? [plugin] : []
  }

  const candidates = await Promise.all(rootEntries
    .filter(entry => entry.isDirectory())
    .map(versionEntry => readPluginCandidate(join(pluginRootPath, versionEntry.name), fallbackPluginName)))
  return candidates.filter((plugin): plugin is CachedClaudePlugin => Boolean(plugin))
}

export async function discoverCachedClaudePlugins(homeDir: string): Promise<CachedClaudePlugin[]> {
  const cached = pluginDiscoveryCache.get(homeDir)
  if (cached) return cached

  const pending = (async () => {
    const cacheDir = resolveClaudePluginCacheDir(homeDir)
    const firstLevelEntries = await readDirSafe(cacheDir)

    const pluginGroups = await Promise.all(firstLevelEntries
      .filter(entry => entry.isDirectory())
      .map(async firstLevelEntry => {
        const firstLevelPath = join(cacheDir, firstLevelEntry.name)

        // Support both the standard cache/<vendor>/<plugin>[/<version>] layout
        // and direct cache/<plugin>[/<version>] layouts without falling back to
        // the old unbounded recursive scan through docs/src/tests trees.
        const directCandidates = await discoverPluginCandidates(firstLevelPath)
        if (directCandidates.length > 0) return directCandidates

        const secondLevelEntries = await readDirSafe(firstLevelPath)
        const nestedGroups = await Promise.all(secondLevelEntries
          .filter(entry => entry.isDirectory())
          .map(secondLevelEntry => discoverPluginCandidates(join(firstLevelPath, secondLevelEntry.name))))
        return nestedGroups.flat()
      }))

    return pluginGroups.flat()
  })().catch(error => {
    pluginDiscoveryCache.delete(homeDir)
    throw error
  })

  pluginDiscoveryCache.set(homeDir, pending)
  return pending
}
