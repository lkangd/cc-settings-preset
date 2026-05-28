import { promises as fs } from 'node:fs'

import {
  resolveCcspStatuslineUnderlyingCommandPath,
  resolveCcspStatuslineUnderlyingPath,
  resolveCcspStatuslineWrapperPath,
  type PathContext,
} from '../core/paths.js'
import type { Settings } from '../core/schema.js'
import type { ProjectLaunchToggleState } from '../flows/project-launch-flow.js'
import { ensureProjectCcspStore } from './project-store-service.js'
import type { ResolvedStatusLine, StatusLineConfig } from './statusline-resolver-service.js'

export type CcspStatusLineMeta = {
  globalName: string
  projectPresetName: string
  toggles: ProjectLaunchToggleState
}

function enabledCount(items: Array<{ enabled: boolean }>): number {
  return items.filter(item => item.enabled).length
}

function formatToggleSummary(toggles: ProjectLaunchToggleState): string {
  const pluginsEnabled = enabledCount(toggles.plugins)
  const skillsEnabled = enabledCount(toggles.skills)
  const mcpsEnabled = enabledCount(toggles.mcps)
  return [
    `plugins(${pluginsEnabled}/${toggles.plugins.length})`,
    `skills(${skillsEnabled}/${toggles.skills.length})`,
    `MCPs(${mcpsEnabled}/${toggles.mcps.length})`,
  ].join(' | ')
}

function formatCcspStatusLine(meta: CcspStatusLineMeta): string {
  return `CCSP: ${meta.globalName}/${meta.projectPresetName} | ${formatToggleSummary(meta.toggles)}`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildUnderlyingScript(commandPath: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail
input=$(cat)
printf '%s' "$input" | bash -c "$(cat ${shellQuote(commandPath)})"
`
}

function buildWrapperScript(input: {
  underlyingScriptPath?: string | undefined
  ccspLine: string
}): string {
  const lines: string[] = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'input=$(cat)',
  ]

  if (input.underlyingScriptPath) {
    lines.push(
      `if underlying_out=$(printf '%s' "$input" | bash ${shellQuote(input.underlyingScriptPath)} 2>/dev/null); then`,
      '  printf "%s\\n" "$underlying_out"',
      'fi',
    )
  }

  lines.push(`printf '\\033[36m%s\\033[0m\\n' ${shellQuote(input.ccspLine)}`)

  return `${lines.join('\n')}\n`
}

function buildInjectedStatusLineConfig(
  wrapperPath: string,
  resolved?: ResolvedStatusLine,
): StatusLineConfig {
  const config: StatusLineConfig = {
    type: 'command',
    command: wrapperPath,
  }

  if (resolved?.config.padding !== undefined) config.padding = resolved.config.padding
  if (resolved?.config.refreshInterval !== undefined) {
    config.refreshInterval = resolved.config.refreshInterval
  } else {
    config.refreshInterval = 5
  }
  if (resolved?.config.hideVimModeIndicator !== undefined) {
    config.hideVimModeIndicator = resolved.config.hideVimModeIndicator
  }

  return config
}

export type InjectedLaunchSettings = Settings & {
  statusLine: StatusLineConfig
}

export async function injectCcspStatusLine(input: {
  settings: Settings
  resolved?: ResolvedStatusLine
  meta: CcspStatusLineMeta
  context: PathContext
  stem: string
}): Promise<InjectedLaunchSettings> {
  const stem = input.stem
  const ccspLine = formatCcspStatusLine(input.meta)

  await ensureProjectCcspStore(input.context.cwd)

  let underlyingScriptPath: string | undefined
  if (input.resolved) {
    const commandPath = resolveCcspStatuslineUnderlyingCommandPath(input.context.cwd, stem)
    const underlyingPath = resolveCcspStatuslineUnderlyingPath(input.context.cwd, stem)
    await fs.writeFile(commandPath, input.resolved.config.command, 'utf8')
    await fs.writeFile(underlyingPath, buildUnderlyingScript(commandPath), 'utf8')
    await fs.chmod(underlyingPath, 0o755)
    underlyingScriptPath = underlyingPath
  }

  const wrapperPath = resolveCcspStatuslineWrapperPath(input.context.cwd, stem)
  await fs.writeFile(
    wrapperPath,
    buildWrapperScript({
      ccspLine,
      ...(underlyingScriptPath ? { underlyingScriptPath } : {}),
    }),
    'utf8',
  )
  await fs.chmod(wrapperPath, 0o755)

  return {
    ...input.settings,
    statusLine: buildInjectedStatusLineConfig(wrapperPath, input.resolved),
  }
}
