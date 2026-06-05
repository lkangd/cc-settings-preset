import { isCcspParseStopToken } from './commands.js'
import { CliError } from './errors.js'

export type SanitizedClaudeArgs = {
  args: string[]
  removedSettings: boolean
}

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

function readFlagValue(args: string[], index: number, flag: string): string | undefined {
  const arg = args[index]
  if (arg === flag) {
    const next = args[index + 1]
    return next !== undefined && !next.startsWith('-') ? next : undefined
  }
  if (arg?.startsWith(`${flag}=`)) {
    return arg.slice(flag.length + 1)
  }
  return undefined
}

export type SessionLaunch = {
  args: string[]
  sessionId?: string
  mode: 'launch' | 'resume' | 'continue'
}

/**
 * Detect how Claude will start (fresh launch / resume / continue) and any
 * session id the caller pinned. We never inject `--session-id` because Claude
 * ignores it in interactive mode — instead the launcher discovers the real id
 * by diffing `~/.claude/projects/<cwd>/` after Claude exits.
 */
export function resolveSessionLaunch(args: string[]): SessionLaunch {
  for (let index = 0; index < args.length; index += 1) {
    const sessionId = readFlagValue(args, index, '--session-id')
    if (sessionId !== undefined) {
      return { args, mode: 'launch', ...(isUuid(sessionId) ? { sessionId } : {}) }
    }
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--continue' || arg === '-c' || arg?.startsWith('--continue=')) {
      return { args, mode: 'continue' }
    }
    if (arg === '--resume' || arg === '-r') {
      const next = args[index + 1]
      const value = next !== undefined && !next.startsWith('-') ? next : undefined
      return { args, mode: 'resume', ...(value && isUuid(value) ? { sessionId: value } : {}) }
    }
    if (arg?.startsWith('--resume=')) {
      const value = arg.slice('--resume='.length)
      return { args, mode: 'resume', ...(isUuid(value) ? { sessionId: value } : {}) }
    }
  }

  return { args, mode: 'launch' }
}

export type DirectRunOptions = {
  isDirectRun: boolean
  globalPreset?: string
  projectPreset?: string
  dryRun: boolean
  remainingArgs: string[]
}

function readNamedFlag(
  args: string[],
  index: number,
  flags: readonly string[],
  label: string,
): { value: string; consumed: number } | undefined {
  const arg = args[index]
  if (!arg) return undefined

  for (const flag of flags) {
    if (arg === flag) {
      const next = args[index + 1]
      if (next === undefined || next.startsWith('-')) {
        throw new CliError(`Missing value for ${label}`)
      }
      return { value: next, consumed: 2 }
    }
    if (arg.startsWith(`${flag}=`)) {
      const value = arg.slice(flag.length + 1)
      if (!value) throw new CliError(`Missing value for ${label}`)
      return { value, consumed: 1 }
    }
  }

  return undefined
}

export function parseDirectRunOptions(args: string[]): DirectRunOptions {
  let globalPreset: string | undefined
  let projectPreset: string | undefined
  let dryRun = false
  const remainingArgs: string[] = []

  let index = 0
  while (index < args.length) {
    const arg = args[index]
    if (!arg) break

    if (isCcspParseStopToken(arg)) {
      remainingArgs.push(...args.slice(index))
      break
    }

    if (arg === '--dry-run') {
      dryRun = true
      index += 1
      continue
    }

    const global = readNamedFlag(args, index, ['-g', '--global-preset'], '--global-preset')
    if (global) {
      globalPreset = global.value
      index += global.consumed
      continue
    }

    const project = readNamedFlag(args, index, ['-p', '--project-preset'], '--project-preset')
    if (project) {
      projectPreset = project.value
      index += project.consumed
      continue
    }

    remainingArgs.push(arg)
    index += 1
  }

  return {
    isDirectRun: globalPreset !== undefined || projectPreset !== undefined,
    ...(globalPreset !== undefined ? { globalPreset } : {}),
    ...(projectPreset !== undefined ? { projectPreset } : {}),
    dryRun,
    remainingArgs,
  }
}

export function sanitizeClaudeArgs(args: string[]): SanitizedClaudeArgs {
  const sanitized: string[] = []
  let removedSettings = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === '--settings') {
      removedSettings = true
      index += 1
      continue
    }

    if (arg?.startsWith('--settings=')) {
      removedSettings = true
      continue
    }

    if (arg !== undefined) sanitized.push(arg)
  }

  return { args: sanitized, removedSettings }
}
