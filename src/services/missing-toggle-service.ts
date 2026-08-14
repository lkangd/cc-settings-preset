import type { LaunchPresetSettings } from '../core/schema.js'

export type MissingToggleNames = {
  plugins: string[]
  skills: string[]
  mcps: string[]
}

type NamedItems = {
  plugins: Array<{ name: string }>
  skills: Array<{ name: string }>
  mcps: Array<{ name: string }>
}

function missingFrom(names: string[], detected: Array<{ name: string }>): string[] {
  const known = new Set(detected.map(item => item.name))
  return names.filter(name => !known.has(name))
}

// The shared skeleton behind every "put the preset's own entries back on the
// list" pass: which names are already there, and what happens to the ones that
// are not. Plugins, skills and mcps differ only in what they build and how they
// sort — keeping the rest here is what stops one of the three drifting on
// dedup or append order with nothing to catch it.
export function appendMissing<T extends { name: string }>(
  states: T[],
  buildMissing: (known: ReadonlySet<string>) => T[],
  sort: (items: T[]) => T[],
): T[] {
  const missing = buildMissing(new Set(states.map(state => state.name)))
  return missing.length === 0 ? states : sort([...states, ...missing])
}

// Names a preset refers to that this project cannot see. A preset is a
// statement of intent, not a snapshot, so these are neither an error nor
// something to drop — they are what the user needs to be told about before
// importing, and what has to survive the next save.
export function collectMissingToggleNames(
  settings: LaunchPresetSettings,
  detected: NamedItems,
): MissingToggleNames {
  return {
    plugins: missingFrom(Object.keys(settings.enabledPlugins ?? {}), detected.plugins),
    skills: missingFrom(Object.keys(settings.skillOverrides ?? {}), detected.skills),
    // Only `serverName` entries name something a project could be missing;
    // command and url policies match by shape and have no name to compare.
    mcps: missingFrom(
      (settings.deniedMcpServers ?? []).flatMap(entry => ('serverName' in entry ? [entry.serverName] : [])),
      detected.mcps,
    ),
  }
}

export function countMissingToggles(missing: MissingToggleNames): number {
  return missing.plugins.length + missing.skills.length + missing.mcps.length
}
