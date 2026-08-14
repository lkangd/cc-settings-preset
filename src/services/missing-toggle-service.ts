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
