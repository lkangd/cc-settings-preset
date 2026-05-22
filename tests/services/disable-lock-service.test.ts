import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyDisableRemovals, resolveDisableLockLocation } from '../../src/services/disable-lock-service.js'

const tempDir = join(process.cwd(), '.tmp-disable-lock-test')

async function writeSettings(filePath: string, settings: Record<string, unknown>): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('resolveDisableLockLocation', () => {
  it('resolves plugin disable from highest-precedence source', () => {
    const filePath = resolveDisableLockLocation('plugins', 'alpha', [
      { scope: 'user', filePath: '/user/settings.json', settings: { enabledPlugins: { alpha: true } } },
      { scope: 'project-local', filePath: '/local/settings.json', settings: { enabledPlugins: { alpha: false } } },
    ])

    expect(filePath).toBe('/local/settings.json')
  })

  it('resolves skill disable from highest-precedence off override', () => {
    const filePath = resolveDisableLockLocation('skills', 'personal', [
      { scope: 'user', filePath: '/user/settings.json', settings: { skillOverrides: { personal: 'on' } } },
      { scope: 'project-local', filePath: '/local/settings.json', settings: { skillOverrides: { personal: 'off' } } },
    ])

    expect(filePath).toBe('/local/settings.json')
  })

  it('resolves mcp deny from first source with matching serverName', () => {
    const filePath = resolveDisableLockLocation('mcps', 'github', [
      { scope: 'user', filePath: '/user/settings.json', settings: { deniedMcpServers: [{ serverName: 'github' }] } },
      { scope: 'project', filePath: '/project/settings.json', settings: { deniedMcpServers: [{ serverName: 'github' }] } },
    ])

    expect(filePath).toBe('/user/settings.json')
  })

  it('returns undefined when no matching disable declaration exists', () => {
    expect(resolveDisableLockLocation('plugins', 'missing', [
      { scope: 'user', filePath: '/user/settings.json', settings: {} },
    ])).toBeUndefined()
  })
})

describe('applyDisableRemovals', () => {
  it('removes only marked entries from settings files', async () => {
    const settingsPath = join(tempDir, 'settings.json')
    await writeSettings(settingsPath, {
      enabledPlugins: { alpha: false, beta: false },
      skillOverrides: { personal: 'off', other: 'on' },
      deniedMcpServers: [{ serverName: 'github' }, { serverName: 'slack' }],
    })

    await applyDisableRemovals([
      { kind: 'plugins', name: 'alpha', filePath: settingsPath },
      { kind: 'skills', name: 'personal', filePath: settingsPath },
      { kind: 'mcps', name: 'github', filePath: settingsPath },
    ])

    const updated = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    expect(updated.enabledPlugins).toEqual({ beta: false })
    expect(updated.skillOverrides).toEqual({ other: 'on' })
    expect(updated.deniedMcpServers).toEqual([{ serverName: 'slack' }])
  })

  it('does not remove unmarked entries', async () => {
    const settingsPath = join(tempDir, 'settings.local.json')
    await writeSettings(settingsPath, {
      enabledPlugins: { alpha: false },
    })

    await applyDisableRemovals([
      { kind: 'plugins', name: 'beta', filePath: settingsPath },
    ])

    const updated = JSON.parse(await fs.readFile(settingsPath, 'utf8'))
    expect(updated.enabledPlugins).toEqual({ alpha: false })
  })
})
