import type { SettingsSource } from './settings-source-service.js'
import { readManagedSettings } from './managed-settings-service.js'

export type StatusLineConfig = {
  type: 'command'
  command: string
  padding?: number
  refreshInterval?: number
  hideVimModeIndicator?: boolean
}

export type StatusLineSourceScope = 'managed' | SettingsSource['scope'] | 'base'

export type ResolvedStatusLine = {
  scope: StatusLineSourceScope
  config: StatusLineConfig
}

function parseStatusLineConfig(settings: unknown): StatusLineConfig | undefined {
  if (!settings || typeof settings !== 'object') return undefined
  const record = settings as Record<string, unknown>
  const raw = record.statusLine ?? record.statusline
  if (!raw || typeof raw !== 'object') return undefined

  const statusLine = raw as Record<string, unknown>
  if (statusLine.type !== 'command' || typeof statusLine.command !== 'string' || !statusLine.command.trim()) {
    return undefined
  }

  const config: StatusLineConfig = {
    type: 'command',
    command: statusLine.command,
  }
  if (typeof statusLine.padding === 'number') config.padding = statusLine.padding
  if (typeof statusLine.refreshInterval === 'number') config.refreshInterval = statusLine.refreshInterval
  if (typeof statusLine.hideVimModeIndicator === 'boolean') {
    config.hideVimModeIndicator = statusLine.hideVimModeIndicator
  }
  return config
}

export async function resolveEffectiveStatusLine(input: {
  claudeSources: SettingsSource[]
  baseSettings?: unknown
}): Promise<ResolvedStatusLine | undefined> {
  const managed = await readManagedSettings()
  const managedConfig = parseStatusLineConfig(managed)
  if (managedConfig) return { scope: 'managed', config: managedConfig }

  const scopeOrder: SettingsSource['scope'][] = ['project-local', 'project', 'user']
  for (const scope of scopeOrder) {
    const source = input.claudeSources.find(candidate => candidate.scope === scope)
    const config = source ? parseStatusLineConfig(source.settings) : undefined
    if (config) return { scope, config }
  }

  const baseConfig = parseStatusLineConfig(input.baseSettings)
  if (baseConfig) return { scope: 'base', config: baseConfig }

  return undefined
}
