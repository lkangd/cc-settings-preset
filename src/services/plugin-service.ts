import type { Settings } from '../core/schema.js'
import type { SettingsSourceScope } from './settings-source-service.js'

export type PluginState = {
  name: string
  enabled: boolean
  // `missing` means the preset names this plugin but nothing in this project
  // does — it is not installed here. Distinct from a plugin that is present and
  // switched off, which is what every other source can represent.
  source: SettingsSourceScope | 'preset' | 'missing'
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

      // `missing` is attached later, from a preset's own contents, so it never
      // originates here — but if a real source does name it, that source owns
      // it outright and there is no precedence to weigh.
      if (current.source === 'preset' || current.source === 'missing') {
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

export function applyPluginOverrides(states: PluginState[], overrides: Record<string, boolean> = {}): PluginState[] {
  return sortPluginStates(states.map(state => {
    if (!(state.name in overrides)) return state
    return { ...state, enabled: overrides[state.name] ?? state.enabled }
  }))
}

export function pluginStatesToEnabledPlugins(states: PluginState[]): Record<string, boolean> {
  const enabledPlugins: Record<string, boolean> = {}
  for (const state of states) {
    // A missing plugin's entry is the only place it is recorded at all, so the
    // usual "only write the ones that are off" rule would delete it on the next
    // save — quietly editing a preset the user only meant to look at.
    if (state.source === 'missing') {
      enabledPlugins[state.name] = state.enabled
      continue
    }
    if (!state.enabled) enabledPlugins[state.name] = false
  }
  return enabledPlugins
}

// Re-attaches the plugins a preset asks for that this project cannot see. The
// detection pass can only enumerate what is installed, so without this the
// difference between "not in the preset" and "in the preset but absent here" is
// lost before it ever reaches the screen.
export function mergeMissingPluginStates(
  states: PluginState[],
  overrides: Record<string, boolean> = {},
): PluginState[] {
  const known = new Set(states.map(state => state.name))
  const missing = Object.entries(overrides)
    .filter(([name]) => !known.has(name))
    .map(([name, enabled]): PluginState => ({ name, enabled, source: 'missing' }))

  return missing.length === 0 ? states : sortPluginStates([...states, ...missing])
}

function matchesPluginRegistryKey(manifestName: string, pluginName: string): boolean {
  return pluginName === manifestName || pluginName.startsWith(`${manifestName}@`)
}

export function resolvePluginRegistryKeys(manifestName: string, pluginNames: string[]): string[] {
  return pluginNames.filter(name => matchesPluginRegistryKey(manifestName, name))
}

export function resolvePluginRegistryKey(manifestName: string, pluginNames: string[]): string | undefined {
  return pluginNames.find(name => matchesPluginRegistryKey(manifestName, name))
}
