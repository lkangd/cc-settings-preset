import {
  parseLaunchPresetSettings,
  parseSettings,
  type LaunchPresetSettings,
  type Settings,
} from '../core/schema.js'
import type { PathContext } from '../core/paths.js'
import type { ProjectLaunchToggleState } from '../flows/project-launch-flow.js'
import { injectCcspStatusLine } from './statusline-injector-service.js'
import { resolveEffectiveStatusLine } from './statusline-resolver-service.js'
import type { SettingsSource } from './settings-source-service.js'

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

type ProjectPresetNameSource =
  | { type: 'launch'; presetName?: string; saveAs?: string }
  | { type: 'temp-launch' | 'back' | 'save' | 'create' | 'rename' | 'delete' | 'refresh' }

export function resolveProjectPresetName(result: ProjectPresetNameSource): string {
  if (result.type !== 'launch') return 'Detected'
  return result.saveAs ?? result.presetName ?? 'Detected'
}

export async function finalizeLaunchSettings(
  baseInput: unknown,
  launchInput: unknown,
  options: {
    globalName: string
    projectPresetName: string
    toggles: ProjectLaunchToggleState
    context: PathContext
    claudeSources: SettingsSource[]
    stem: string
    statusLineEnabled: boolean
  },
): Promise<Settings> {
  const finalized = finalizeSettings(baseInput, launchInput)
  if (!options.statusLineEnabled) return finalized

  const resolved = await resolveEffectiveStatusLine({
    claudeSources: options.claudeSources,
    baseSettings: baseInput,
  })

  return injectCcspStatusLine({
    settings: finalized,
    ...(resolved ? { resolved } : {}),
    meta: {
      globalName: options.globalName,
      projectPresetName: options.projectPresetName,
      toggles: options.toggles,
    },
    context: options.context,
    stem: options.stem,
  })
}
