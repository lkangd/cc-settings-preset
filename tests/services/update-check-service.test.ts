import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { createUpdateCheckService } from '../../src/services/update-check-service.js'

async function createHomeDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ccsp-update-check-'))
}

function readCache(homeDir: string): unknown {
  return JSON.parse(readFileSync(join(homeDir, '.ccsp', 'update-check.json'), 'utf8'))
}

describe('createUpdateCheckService', () => {
  it('returns an update notice from cached latest version newer than current', async () => {
    const homeDir = await createHomeDir()
    const service = createUpdateCheckService({
      homeDir,
      currentVersion: '1.2.4',
      fetchText: async () => JSON.stringify({ 'dist-tags': { latest: '1.3.0' } }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
      ttlMs: 6 * 60 * 60 * 1000,
    })

    await service.refreshInBackground()

    expect(service.readCachedNotice()).toBe('Update available: v1.3.0 (current v1.2.4) · run ccsp update')
  })

  it('does not return a notice when cached latest is not newer than current', async () => {
    const homeDir = await createHomeDir()
    const service = createUpdateCheckService({
      homeDir,
      currentVersion: '1.2.4',
      fetchText: async () => JSON.stringify({ 'dist-tags': { latest: '1.2.4' } }),
      now: () => new Date('2026-07-01T00:00:00.000Z'),
      ttlMs: 6 * 60 * 60 * 1000,
    })

    await service.refreshInBackground()

    expect(service.readCachedNotice()).toBeUndefined()
  })

  it('skips remote checks while the cache is within ttl', async () => {
    const homeDir = await createHomeDir()
    const fetchText = vi.fn(async () => JSON.stringify({ 'dist-tags': { latest: '1.3.0' } }))
    const service = createUpdateCheckService({
      homeDir,
      currentVersion: '1.2.4',
      fetchText,
      now: () => new Date('2026-07-01T00:00:00.000Z'),
      ttlMs: 6 * 60 * 60 * 1000,
    })

    await service.refreshInBackground()
    await service.refreshInBackground()

    expect(fetchText).toHaveBeenCalledTimes(1)
  })

  it('refreshes stale cache after ttl expires', async () => {
    const homeDir = await createHomeDir()
    let now = new Date('2026-07-01T00:00:00.000Z')
    const fetchText = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce(JSON.stringify({ 'dist-tags': { latest: '1.3.0' } }))
      .mockResolvedValueOnce(JSON.stringify({ 'dist-tags': { latest: '1.4.0' } }))
    const service = createUpdateCheckService({
      homeDir,
      currentVersion: '1.2.4',
      fetchText,
      now: () => now,
      ttlMs: 6 * 60 * 60 * 1000,
    })

    await service.refreshInBackground()
    now = new Date('2026-07-01T07:00:00.000Z')
    await service.refreshInBackground()

    expect(fetchText).toHaveBeenCalledTimes(2)
    expect(service.readCachedNotice()).toContain('v1.4.0')
    expect(readCache(homeDir)).toMatchObject({
      latestVersion: '1.4.0',
      checkedAt: '2026-07-01T07:00:00.000Z',
    })
  })

  it('swallows refresh errors so startup is not interrupted', async () => {
    const homeDir = await createHomeDir()
    const service = createUpdateCheckService({
      homeDir,
      currentVersion: '1.2.4',
      fetchText: async () => { throw new Error('network unavailable') },
      now: () => new Date('2026-07-01T00:00:00.000Z'),
      ttlMs: 6 * 60 * 60 * 1000,
    })

    await expect(service.refreshInBackground()).resolves.toBeUndefined()

    expect(service.readCachedNotice()).toBeUndefined()
    expect(existsSync(join(homeDir, '.ccsp', 'update-check.json'))).toBe(false)
  })
})
