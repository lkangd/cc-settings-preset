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

export function resolvePluginStates(sources: PluginSettingsSource[]): PluginState[] {
  const resolved = new Map<string, PluginState>()

  for (const source of sources) {
    const enabledPlugins = source.settings.enabledPlugins ?? {}
    for (const [name, enabled] of Object.entries(enabledPlugins)) {
      if (!resolved.has(name)) {
        resolved.set(name, { name, enabled, source: source.scope })
      }
    }
  }

  return Array.from(resolved.values()).sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function pluginStatesToEnabledPlugins(states: PluginState[]): Record<string, boolean> {
  const enabledPlugins: Record<string, boolean> = {}
  for (const state of states) enabledPlugins[state.name] = state.enabled
  return enabledPlugins
}
