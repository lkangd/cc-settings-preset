import type { Settings } from '../core/schema.js'
import type { SettingsSourceScope } from './settings-source-service.js'

export type PluginState = {
  name: string
  enabled: boolean
  source: SettingsSourceScope | 'preset'
}

export type PluginSettingsSource = {
  scope: SettingsSourceScope | 'preset'
  filePath: string
  settings: Settings
}

export function sortPluginStates(states: PluginState[]): PluginState[] {
  return [...states].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function resolvePluginStates(sources: PluginSettingsSource[]): PluginState[] {
  const sourceRank: Record<PluginSettingsSource['scope'], number> = {
    user: 0,
    project: 1,
    'project-local': 2,
    preset: 3,
  }
  const resolved = new Map<string, PluginState>()

  for (const source of [...sources].sort((a, b) => sourceRank[a.scope] - sourceRank[b.scope])) {
    const enabledPlugins = source.settings.enabledPlugins ?? {}
    for (const [name, enabled] of Object.entries(enabledPlugins)) {
      resolved.set(name, { name, enabled, source: source.scope })
    }
  }

  return sortPluginStates(Array.from(resolved.values()))
}

export function pluginStatesToEnabledPlugins(states: PluginState[]): Record<string, boolean> {
  const enabledPlugins: Record<string, boolean> = {}
  for (const state of states) enabledPlugins[state.name] = state.enabled
  return enabledPlugins
}
