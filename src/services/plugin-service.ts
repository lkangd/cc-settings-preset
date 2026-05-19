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
  const ownershipPrecedence: Record<SettingsSourceScope, number> = {
    user: 0,
    project: 1,
    'project-local': 2,
  }
  const resolved = new Map<string, PluginState>()

  for (const source of sources) {
    const enabledPlugins = source.settings.enabledPlugins ?? {}
    for (const [name, enabled] of Object.entries(enabledPlugins)) {
      const current = resolved.get(name)

      if (source.scope === 'preset') {
        if (current) {
          resolved.set(name, { ...current, enabled })
        } else {
          resolved.set(name, { name, enabled, source: 'preset' })
        }
        continue
      }

      if (!current) {
        resolved.set(name, { name, enabled, source: source.scope })
        continue
      }

      if (current.source === 'preset') {
        resolved.set(name, { ...current, source: source.scope })
        continue
      }

      if (ownershipPrecedence[source.scope] >= ownershipPrecedence[current.source]) {
        resolved.set(name, { name, enabled, source: source.scope })
      }
    }
  }

  return sortPluginStates(Array.from(resolved.values()))
}

export function forceEnablePlugins(states: PluginState[]): PluginState[] {
  return sortPluginStates(states.map(state => ({ ...state, enabled: true })))
}

export function applyPluginOverrides(states: PluginState[], overrides: Record<string, boolean> = {}): PluginState[] {
  return sortPluginStates(states.map(state => {
    if (!(state.name in overrides)) return state
    return { ...state, enabled: overrides[state.name] }
  }))
}

export function pluginStatesToEnabledPlugins(states: PluginState[]): Record<string, boolean> {
  const enabledPlugins: Record<string, boolean> = {}
  for (const state of states) enabledPlugins[state.name] = state.enabled
  return enabledPlugins
}
