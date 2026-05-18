import { promises as fs, type Dirent } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { pathExists, readJsonFile } from '../core/json.js'
import { resolveClaudePluginCacheDir, resolveProjectCommandsDir, resolveProjectSkillsDir, resolveUserSkillsDir } from '../core/paths.js'
import type { SkillOverrideValue } from '../core/schema.js'

export type SkillState = {
  name: string
  enabled: boolean
  source: 'user' | 'project' | 'command' | 'plugin'
  toggleable: boolean
  controlledByPlugin?: string
}

export type SkillDiscoveryInput = {
  homeDir: string
  cwd: string
  enabledPlugins: Record<string, boolean>
  skillOverrides?: Record<string, SkillOverrideValue>
}

async function readDirSafe(dirPath: string): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function isDirectoryLike(entryPath: string, entry: Dirent): Promise<boolean> {
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false

  try {
    return (await fs.stat(entryPath)).isDirectory()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function discoverSkillDir(dirPath: string, source: 'user' | 'project'): Promise<SkillState[]> {
  const entries = await readDirSafe(dirPath)
  const skills: SkillState[] = []

  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name)
    if (!await isDirectoryLike(entryPath, entry)) continue
    const skillPath = join(entryPath, 'SKILL.md')
    if (await pathExists(skillPath)) {
      skills.push({ name: entry.name, enabled: true, source, toggleable: true })
    }
  }

  return skills
}

async function discoverProjectSkills(cwd: string): Promise<SkillState[]> {
  const skills: SkillState[] = []
  let current = cwd

  while (true) {
    skills.push(...await discoverSkillDir(resolveProjectSkillsDir(current), 'project'))
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return skills
}

async function discoverCommandSkills(commandsDir: string): Promise<SkillState[]> {
  const entries = await readDirSafe(commandsDir)
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => ({
      name: entry.name.slice(0, -'.md'.length),
      enabled: true,
      source: 'command' as const,
      toggleable: true,
    }))
}

async function discoverPluginSkills(homeDir: string, enabledPlugins: Record<string, boolean>): Promise<SkillState[]> {
  const cacheDir = resolveClaudePluginCacheDir(homeDir)
  const enabledPluginNames = new Set(Object.entries(enabledPlugins).filter(([, enabled]) => enabled).map(([name]) => name))
  const skills: SkillState[] = []

  async function scan(dirPath: string): Promise<void> {
    const entries = await readDirSafe(dirPath)

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = join(dirPath, entry.name)
      const manifestPath = join(fullPath, 'plugin.json')

      if (await pathExists(manifestPath)) {
        const manifest = await readJsonFile(manifestPath) as { name?: unknown }
        const pluginName = typeof manifest.name === 'string' ? manifest.name : basename(fullPath)
        if (!enabledPluginNames.has(pluginName)) continue

        const skillEntries = await readDirSafe(join(fullPath, 'skills'))
        for (const skillEntry of skillEntries) {
          if (!skillEntry.isDirectory()) continue
          const skillPath = join(fullPath, 'skills', skillEntry.name, 'SKILL.md')
          if (await pathExists(skillPath)) {
            skills.push({
              name: `${pluginName}:${skillEntry.name}`,
              enabled: true,
              source: 'plugin',
              toggleable: false,
              controlledByPlugin: pluginName,
            })
          }
        }
        continue
      }

      await scan(fullPath)
    }
  }

  await scan(cacheDir)
  return skills
}

function compareSkillSourceThenName(a: SkillState, b: SkillState): number {
  const sourceRank: Record<SkillState['source'], number> = {
    command: 0,
    plugin: 1,
    user: 2,
    project: 3,
  }

  if (sourceRank[a.source] !== sourceRank[b.source]) return sourceRank[a.source] - sourceRank[b.source]
  return a.name.localeCompare(b.name)
}

export function sortSkillStates(states: SkillState[]): SkillState[] {
  return [...states].sort(compareSkillSourceThenName)
}

export function sortSkillStatesByStatus(states: SkillState[]): SkillState[] {
  return [...states].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return compareSkillSourceThenName(a, b)
  })
}

export function applySkillOverrides(
  states: SkillState[],
  overrides: Record<string, SkillOverrideValue> = {},
): SkillState[] {
  return sortSkillStates(states.map(skill => {
    if (skill.source === 'plugin') return skill
    return { ...skill, enabled: overrides[skill.name] !== 'off' }
  }))
}

export async function discoverSkillStates(input: SkillDiscoveryInput): Promise<SkillState[]> {
  const projectSkills = await discoverProjectSkills(input.cwd)
  const commandSkills = await discoverCommandSkills(resolveProjectCommandsDir(input.cwd))
  const userSkills = await discoverSkillDir(resolveUserSkillsDir(input.homeDir), 'user')
  const pluginSkills = await discoverPluginSkills(input.homeDir, input.enabledPlugins)
  const byName = new Map<string, SkillState>()

  for (const skill of projectSkills) byName.set(skill.name, skill)
  for (const skill of commandSkills) if (!byName.has(skill.name)) byName.set(skill.name, skill)
  for (const skill of userSkills) byName.set(skill.name, skill)
  for (const skill of pluginSkills) byName.set(skill.name, skill)

  return sortSkillStates(Array.from(byName.values()))
}

export function skillStatesToOverrides(states: SkillState[]): Record<string, SkillOverrideValue> {
  const overrides: Record<string, SkillOverrideValue> = {}
  for (const state of states) {
    if (state.toggleable && !state.enabled) overrides[state.name] = 'off'
  }
  return overrides
}
