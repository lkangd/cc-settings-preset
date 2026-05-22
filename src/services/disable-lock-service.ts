import { readJsonFile, writeJsonFile } from '../core/json.js'
import { parseSettings, type Settings } from '../core/schema.js'
import type { SettingsSourceScope } from './settings-source-service.js'

export type DisableLockSource = {
  scope: SettingsSourceScope | 'preset'
  filePath: string
  settings: Settings
}

export type DisableRemovalMark = {
  kind: 'plugins' | 'skills' | 'mcps'
  name: string
  filePath: string
}

const ownershipPrecedence: Record<SettingsSourceScope, number> = {
  user: 0,
  project: 1,
  'project-local': 2,
}

function resolvePluginDisableLockFilePath(name: string, sources: DisableLockSource[]): string | undefined {
  let owner: { filePath: string; enabled: boolean; scope: SettingsSourceScope | 'preset' } | undefined

  for (const source of sources) {
    const enabled = source.settings.enabledPlugins?.[name]
    if (enabled === undefined) continue

    if (source.scope === 'preset') {
      if (owner) {
        owner = { filePath: source.filePath, enabled, scope: owner.scope }
      } else {
        owner = { filePath: source.filePath, enabled, scope: 'preset' }
      }
      continue
    }

    if (!owner) {
      owner = { filePath: source.filePath, enabled, scope: source.scope }
      continue
    }

    if (owner.scope === 'preset') {
      owner = { filePath: source.filePath, enabled, scope: source.scope }
      continue
    }

    if (ownershipPrecedence[source.scope] >= ownershipPrecedence[owner.scope as SettingsSourceScope]) {
      owner = { filePath: source.filePath, enabled, scope: source.scope }
    }
  }

  return owner && !owner.enabled ? owner.filePath : undefined
}

function resolveSkillDisableLockFilePath(name: string, sources: DisableLockSource[]): string | undefined {
  let owner: { filePath: string; value: string; scope: SettingsSourceScope | 'preset' } | undefined

  for (const source of sources) {
    const value = source.settings.skillOverrides?.[name]
    if (value === undefined) continue

    if (source.scope === 'preset') {
      owner = { filePath: source.filePath, value, scope: 'preset' }
      continue
    }

    if (!owner) {
      owner = { filePath: source.filePath, value, scope: source.scope }
      continue
    }

    if (owner.scope === 'preset') {
      owner = { filePath: source.filePath, value, scope: source.scope }
      continue
    }

    if (ownershipPrecedence[source.scope] >= ownershipPrecedence[owner.scope as SettingsSourceScope]) {
      owner = { filePath: source.filePath, value, scope: source.scope }
    }
  }

  return owner && owner.value === 'off' ? owner.filePath : undefined
}

function resolveMcpDisableLockFilePath(name: string, sources: DisableLockSource[]): string | undefined {
  const seenServerNames = new Set<string>()

  for (const source of sources) {
    for (const entry of source.settings.deniedMcpServers ?? []) {
      if (!('serverName' in entry)) continue
      if (entry.serverName !== name) continue
      if (seenServerNames.has(entry.serverName)) continue
      seenServerNames.add(entry.serverName)
      return source.filePath
    }
  }

  return undefined
}

export function resolveDisableLockLocation(
  kind: DisableRemovalMark['kind'],
  name: string,
  sources: DisableLockSource[],
): string | undefined {
  if (kind === 'plugins') return resolvePluginDisableLockFilePath(name, sources)
  if (kind === 'skills') return resolveSkillDisableLockFilePath(name, sources)
  return resolveMcpDisableLockFilePath(name, sources)
}

function hasEntries(record: Record<string, unknown> | undefined): boolean {
  return record !== undefined && Object.keys(record).length > 0
}

function removeMarkFromSettings(settings: Settings, mark: DisableRemovalMark): boolean {
  if (mark.kind === 'plugins') {
    const enabledPlugins = settings.enabledPlugins
    if (!enabledPlugins || !(mark.name in enabledPlugins) || enabledPlugins[mark.name] !== false) {
      return false
    }
    delete enabledPlugins[mark.name]
    if (!hasEntries(enabledPlugins)) delete settings.enabledPlugins
    return true
  }

  if (mark.kind === 'skills') {
    const skillOverrides = settings.skillOverrides
    if (!skillOverrides || !(mark.name in skillOverrides) || skillOverrides[mark.name] !== 'off') {
      return false
    }
    delete skillOverrides[mark.name]
    if (!hasEntries(skillOverrides)) delete settings.skillOverrides
    return true
  }

  const deniedMcpServers = settings.deniedMcpServers
  if (!deniedMcpServers) return false

  const nextDenied = deniedMcpServers.filter(entry => !('serverName' in entry && entry.serverName === mark.name))
  if (nextDenied.length === deniedMcpServers.length) return false

  if (nextDenied.length === 0) delete settings.deniedMcpServers
  else settings.deniedMcpServers = nextDenied
  return true
}

export async function applyDisableRemovals(marks: DisableRemovalMark[]): Promise<void> {
  if (marks.length === 0) return

  const marksByFile = new Map<string, DisableRemovalMark[]>()
  for (const mark of marks) {
    const existing = marksByFile.get(mark.filePath) ?? []
    existing.push(mark)
    marksByFile.set(mark.filePath, existing)
  }

  for (const [filePath, fileMarks] of marksByFile) {
    const raw = await readJsonFile(filePath)
    const settings = parseSettings(raw)
    let changed = false

    for (const mark of fileMarks) {
      if (removeMarkFromSettings(settings, mark)) changed = true
    }

    if (changed) await writeJsonFile(filePath, settings)
  }
}
