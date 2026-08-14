import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createClaudePluginInstallationService,
  type PluginInstallRunner,
} from '../../src/services/claude-plugin-installation-service.js'
import { resolveUserClaudeInstalledPluginsPath } from '../../src/core/paths.js'
import type { PluginState } from '../../src/services/plugin-service.js'

const homes: string[] = []

async function createHome(): Promise<string> {
  const home = await fs.mkdtemp(join(tmpdir(), 'ccsp-plugin-sync-'))
  homes.push(home)
  return home
}

async function writeRegistry(home: string, value: unknown): Promise<void> {
  const path = resolveUserClaudeInstalledPluginsPath(home)
  await fs.mkdir(join(home, '.claude', 'plugins'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(value), 'utf8')
}

function projectPlugins(names: string[]): PluginState[] {
  return names.map(name => ({ name, enabled: true, source: 'project' }))
}

function successfulRunner(): ReturnType<typeof vi.fn<PluginInstallRunner>> {
  return vi.fn<PluginInstallRunner>().mockResolvedValue({ status: 0, stderr: '' })
}

afterEach(async () => {
  await Promise.all(homes.splice(0).map(home => fs.rm(home, { recursive: true, force: true })))
})

describe('createClaudePluginInstallationService', () => {
  it('skips install when the exact worktree already has a valid project record', async () => {
    const home = await createHome()
    const installPath = join(home, 'cache', 'chrome-devtools-mcp', '1.6.0')
    await fs.mkdir(installPath, { recursive: true })
    await writeRegistry(home, {
      version: 2,
      plugins: {
        'chrome-devtools-mcp@chrome-devtools-plugins': [{
          scope: 'project',
          projectPath: '/repo/worktree',
          installPath,
          version: '1.6.0',
        }],
      },
    })
    const runner = successfulRunner()

    const result = await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['chrome-devtools-mcp@chrome-devtools-plugins']))

    expect(result).toEqual({ failures: [] })
    expect(runner).not.toHaveBeenCalled()
  })

  it('uses the official Claude installer for a worktree without a project record', async () => {
    const home = await createHome()
    const installPath = join(home, 'cache', 'demo')
    await fs.mkdir(installPath, { recursive: true })
    await writeRegistry(home, {
      version: 2,
      plugins: {
        'demo@marketplace': [{ scope: 'project', projectPath: '/repo/main', installPath }],
      },
    })
    const runner = successfulRunner()

    const result = await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['demo']))

    expect(result).toEqual({ failures: [] })
    expect(runner).toHaveBeenCalledWith('demo', '/repo/worktree')
  })

  it('only installs enabled non-user plugins at project scope', async () => {
    const home = await createHome()
    const runner = successfulRunner()

    await createClaudePluginInstallationService(home, runner).synchronizeProjectPlugins('/repo/worktree', [
      { name: 'user-plugin', enabled: true, source: 'user' },
      { name: 'project-plugin', enabled: true, source: 'project' },
      { name: 'local-plugin', enabled: true, source: 'project-local' },
      { name: 'preset-plugin', enabled: true, source: 'preset' },
      { name: 'disabled-plugin', enabled: false, source: 'project' },
    ])

    expect(runner.mock.calls.map(([pluginName]) => pluginName)).toEqual([
      'project-plugin',
      'local-plugin',
      'preset-plugin',
    ])
  })

  it('checks all matching registry keys and install paths', async () => {
    const home = await createHome()
    const validPath = join(home, 'cache', 'valid')
    await fs.mkdir(validPath, { recursive: true })
    await writeRegistry(home, {
      version: 2,
      plugins: {
        demo: [{ scope: 'project', projectPath: '/repo/worktree', installPath: join(home, 'cache', 'missing') }],
        'demo@marketplace': [{ scope: 'project', projectPath: '/repo/worktree', installPath: validPath }],
      },
    })
    const runner = successfulRunner()

    await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['demo']))

    expect(runner).not.toHaveBeenCalled()
  })

  it('installs instead of aborting when an installation path cannot be checked', async () => {
    const home = await createHome()
    await writeRegistry(home, {
      version: 2,
      plugins: {
        demo: [{ scope: 'project', projectPath: '/repo/worktree', installPath: 'invalid\0path' }],
      },
    })
    const runner = successfulRunner()

    const result = await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['demo']))

    expect(result).toEqual({ failures: [] })
    expect(runner).toHaveBeenCalledWith('demo', '/repo/worktree')
  })

  it('keeps valid records when a sibling registry record is malformed', async () => {
    const home = await createHome()
    const installPath = join(home, 'cache', 'valid')
    await fs.mkdir(installPath, { recursive: true })
    await writeRegistry(home, {
      version: 2,
      plugins: {
        demo: [
          { scope: 'project', projectPath: '/repo/worktree', installPath },
          null,
        ],
      },
    })
    const runner = successfulRunner()

    await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['demo']))

    expect(runner).not.toHaveBeenCalled()
  })

  it('returns before reading a malformed registry when no eligible plugins are enabled', async () => {
    const home = await createHome()
    const registryPath = resolveUserClaudeInstalledPluginsPath(home)
    await fs.mkdir(join(home, '.claude', 'plugins'), { recursive: true })
    await fs.writeFile(registryPath, '{ invalid json', 'utf8')
    const runner = successfulRunner()

    const result = await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', [{ name: 'demo', enabled: true, source: 'user' }])

    expect(result).toEqual({ failures: [] })
    expect(runner).not.toHaveBeenCalled()
  })

  it('reports a malformed registry while letting the official installer repair it', async () => {
    const home = await createHome()
    const registryPath = resolveUserClaudeInstalledPluginsPath(home)
    await fs.mkdir(join(home, '.claude', 'plugins'), { recursive: true })
    await fs.writeFile(registryPath, '{ invalid json', 'utf8')
    const runner = successfulRunner()

    const result = await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['demo']))

    expect(result.warning).toContain('Unable to read Claude plugin registry')
    expect(runner).toHaveBeenCalledWith('demo', '/repo/worktree')
  })

  it('reports plugins whose official installation fails', async () => {
    const home = await createHome()
    const runner = vi.fn<PluginInstallRunner>().mockResolvedValue({ status: 1, stderr: 'failed' })

    const result = await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['demo', 'demo']))

    expect(result).toEqual({ failures: [{ pluginName: 'demo', stderr: 'failed' }] })
    expect(runner).toHaveBeenCalledTimes(1)
  })

  it('reports a rejected installer without aborting later installs', async () => {
    const home = await createHome()
    const runner = vi.fn<PluginInstallRunner>()
      .mockRejectedValueOnce(new Error('spawn failed'))
      .mockResolvedValueOnce({ status: 0, stderr: '' })

    const result = await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['broken', 'working']))

    expect(result).toEqual({ failures: [{ pluginName: 'broken', stderr: 'spawn failed' }] })
    expect(runner).toHaveBeenCalledTimes(2)
  })

  it('announces each install it is about to run, counting only the plugins that need one', async () => {
    const home = await createHome()
    const installPath = join(home, 'cache', 'present')
    await fs.mkdir(installPath, { recursive: true })
    await writeRegistry(home, {
      version: 2,
      plugins: {
        present: [{ scope: 'project', projectPath: '/repo/worktree', installPath }],
      },
    })
    const onProgress = vi.fn()

    await createClaudePluginInstallationService(home, successfulRunner())
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['present', 'first', 'second']), onProgress)

    // 报告发生在安装之前：这条线本来就是给「正在等」的那一刻看的。
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { pluginName: 'first', index: 1, total: 2 },
      { pluginName: 'second', index: 2, total: 2 },
    ])
  })

  it('still announces an install whose runner then fails', async () => {
    const home = await createHome()
    const onProgress = vi.fn()

    await createClaudePluginInstallationService(home, vi.fn<PluginInstallRunner>().mockRejectedValue(new Error('spawn failed')))
      .synchronizeProjectPlugins('/repo/worktree', projectPlugins(['broken']), onProgress)

    expect(onProgress).toHaveBeenCalledWith({ pluginName: 'broken', index: 1, total: 1 })
  })

  it('never installs a plugin the preset only names as missing here', async () => {
    const home = await createHome()
    const runner = successfulRunner()

    const result = await createClaudePluginInstallationService(home, runner)
      .synchronizeProjectPlugins('/repo/worktree', [
        { name: 'absent', enabled: true, source: 'missing' },
        { name: 'present', enabled: true, source: 'project' },
      ])

    expect(result).toEqual({ failures: [] })
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith('present', '/repo/worktree')
  })
})
