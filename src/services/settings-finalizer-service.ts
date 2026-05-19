import {
  parseLaunchPresetSettings,
  parseSettings,
  type LaunchPresetSettings,
  type Settings,
} from '../core/schema.js'

function hasEntries(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0)
}

export function finalizeSettings(baseInput: unknown, launchInput: unknown): Settings {
  const base = parseSettings(baseInput)
  const launch = parseLaunchPresetSettings(launchInput) as LaunchPresetSettings
  const finalized: Settings = { ...base }

  delete finalized.enabledPlugins
  delete finalized.skillOverrides
  delete finalized.deniedMcpServers

  if (hasEntries(launch.enabledPlugins)) finalized.enabledPlugins = launch.enabledPlugins
  if (hasEntries(launch.skillOverrides)) finalized.skillOverrides = launch.skillOverrides
  if (launch.deniedMcpServers && launch.deniedMcpServers.length > 0) {
    finalized.deniedMcpServers = launch.deniedMcpServers
  }

  return parseSettings(finalized)
}
