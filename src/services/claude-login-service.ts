import { spawnSync } from 'node:child_process'

import { pathExists } from '../core/json.js'
import { resolveClaudeCredentialsPath, type PathContext } from '../core/paths.js'

const KEYCHAIN_SERVICE = 'Claude Code-credentials'

export type ClaudeLoginDeps = {
  pathExists: typeof pathExists
  hasKeychainCredentials: (service: string) => boolean
  platform: NodeJS.Platform
}

// `security` without `-w` only reads metadata, so it never prompts for the secret.
function defaultHasKeychainCredentials(service: string): boolean {
  const result = spawnSync('security', ['find-generic-password', '-s', service], { stdio: 'ignore' })
  return result.status === 0
}

export function createClaudeLoginService(context: PathContext, deps: Partial<ClaudeLoginDeps> = {}) {
  const checkPathExists = deps.pathExists ?? pathExists
  const hasKeychainCredentials = deps.hasKeychainCredentials ?? defaultHasKeychainCredentials
  const platform = deps.platform ?? process.platform

  return {
    async isLoggedIn(): Promise<boolean> {
      if (await checkPathExists(resolveClaudeCredentialsPath(context.homeDir))) return true
      if (platform === 'darwin' && hasKeychainCredentials(KEYCHAIN_SERVICE)) return true
      return false
    },
  }
}
