import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { createClaudeLoginService } from '../../src/services/claude-login-service.js'

const context = { homeDir: '/home/user', cwd: '/work' }
const credentialsPath = join('/home/user', '.claude', '.credentials.json')

describe('createClaudeLoginService.isLoggedIn', () => {
  it('returns true when the credentials file exists', async () => {
    const service = createClaudeLoginService(context, {
      pathExists: async path => path === credentialsPath,
      hasKeychainCredentials: () => false,
      platform: 'linux',
    })

    expect(await service.isLoggedIn()).toBe(true)
  })

  it('falls back to the macOS keychain when no credentials file exists', async () => {
    const hasKeychainCredentials = vi.fn(() => true)
    const service = createClaudeLoginService(context, {
      pathExists: async () => false,
      hasKeychainCredentials,
      platform: 'darwin',
    })

    expect(await service.isLoggedIn()).toBe(true)
    expect(hasKeychainCredentials).toHaveBeenCalledWith('Claude Code-credentials')
  })

  it('does not consult the keychain on non-darwin platforms', async () => {
    const hasKeychainCredentials = vi.fn(() => true)
    const service = createClaudeLoginService(context, {
      pathExists: async () => false,
      hasKeychainCredentials,
      platform: 'linux',
    })

    expect(await service.isLoggedIn()).toBe(false)
    expect(hasKeychainCredentials).not.toHaveBeenCalled()
  })

  it('returns false when nothing indicates a login', async () => {
    const service = createClaudeLoginService(context, {
      pathExists: async () => false,
      hasKeychainCredentials: () => false,
      platform: 'darwin',
    })

    expect(await service.isLoggedIn()).toBe(false)
  })
})
