export type SanitizedClaudeArgs = {
  args: string[]
  removedSettings: boolean
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
