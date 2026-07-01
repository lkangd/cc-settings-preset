import { describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  createUpdateService,
  extractChangelogRange,
  type CommandRunner,
} from '../../src/services/update-service.js'

describe('compareVersions', () => {
  it('orders dotted numeric versions', () => {
    expect(compareVersions('1.2.0', '1.2.1')).toBeLessThan(0)
    expect(compareVersions('1.10.0', '1.2.9')).toBeGreaterThan(0)
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0)
  })
})

describe('extractChangelogRange', () => {
  it('returns entries newer than current through latest', () => {
    const changelog = `# Changelog\n\n## 1.3.0 (2026-06-30)\n\n### Features\n* add update\n\n## 1.2.1 (2026-06-29)\n\n### Fixes\n* fix launch\n\n## 1.2.0 (2026-06-26)\n\n### Performance\n* speed up\n`

    expect(extractChangelogRange(changelog, '1.2.0', '1.3.0')).toContain('## 1.3.0')
    expect(extractChangelogRange(changelog, '1.2.0', '1.3.0')).toContain('## 1.2.1')
    expect(extractChangelogRange(changelog, '1.2.0', '1.3.0')).not.toContain('## 1.2.0')
  })
})

describe('createUpdateService', () => {
  it('stops when current version is latest', async () => {
    const output: string[] = []
    const service = createUpdateService({
      currentVersion: '1.2.0',
      fetchText: async url => url.includes('registry.npmjs.org')
        ? JSON.stringify({ 'dist-tags': { latest: '1.2.0' } })
        : '# Changelog\n',
      runCommand: vi.fn(),
      write: value => output.push(value),
    })

    await service.update()

    expect(output.join('')).toContain('Current ccsp version: 1.2.0')
    expect(output.join('')).toContain('ccsp is already up to date.')
  })

  it('runs noninteractive brew upgrade for Homebrew installs', async () => {
    const calls: Parameters<CommandRunner>[0][] = []
    const service = createUpdateService({
      currentVersion: '1.2.0',
      fetchText: async url => url.includes('registry.npmjs.org')
        ? JSON.stringify({ 'dist-tags': { latest: '1.3.0' } })
        : '# Changelog\n\n## 1.3.0 (2026-06-30)\n\n### Features\n* add update\n',
      runCommand: async command => {
        calls.push(command)
        return { status: 0, stdout: '', stderr: '' }
      },
      write: () => {},
    })

    await service.update()

    expect(calls.map(call => call.command)).toEqual(['brew', 'brew', 'brew'])
    expect(calls.map(call => call.args)).toEqual([
      ['list', '--formula', 'cc-settings-preset'],
      ['update', '--quiet'],
      ['upgrade', 'cc-settings-preset', '--yes'],
    ])
    expect(calls[1]).toMatchObject({
      inheritStdio: true,
      env: {
        HOMEBREW_NO_ASK: '1',
        HOMEBREW_NO_INSTALL_CLEANUP: '1',
      },
    })
    expect(calls[2]).toMatchObject({
      inheritStdio: true,
      env: {
        HOMEBREW_NO_ASK: '1',
        HOMEBREW_NO_INSTALL_CLEANUP: '1',
      },
    })
  })

  it('falls back to npm update for npm global installs', async () => {
    const calls: Parameters<CommandRunner>[0][] = []
    const service = createUpdateService({
      currentVersion: '1.2.0',
      fetchText: async url => url.includes('registry.npmjs.org')
        ? JSON.stringify({ 'dist-tags': { latest: '1.3.0' } })
        : '# Changelog\n\n## 1.3.0 (2026-06-30)\n\n### Features\n* add update\n',
      runCommand: async command => {
        calls.push(command)
        if (command.command === 'brew') return { status: 1, stdout: '', stderr: '' }
        return { status: 0, stdout: '{}', stderr: '' }
      },
      write: () => {},
    })

    await service.update()

    expect(calls.at(-1)).toEqual({
      command: 'npm',
      args: ['install', '-g', '@lkangd/cc-settings-preset@latest'],
      inheritStdio: true,
    })
  })
})
