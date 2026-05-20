import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createGlobalLastSettingsService } from '../../src/services/global-last-settings-service.js'

describe('global last settings service', () => {
  it('stores and reads the remembered preset per project', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'ccsp-home-'))
    const service = createGlobalLastSettingsService(homeDir)
    const cwd = '/Users/liangkangda/Fe-project/code/cc-settings-preset'

    await service.writeLastUsed(cwd, 'work')

    expect(await service.readLastUsed(cwd)).toBe('work')
    expect(JSON.parse(await readFile(join(homeDir, '.ccsp', 'last-settings.json'), 'utf8'))).toEqual({
      [cwd]: {
        presetName: 'work',
        updatedAt: expect.any(String),
      },
    })
  })

  it('preserves records for other projects in the same file', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'ccsp-home-'))
    const service = createGlobalLastSettingsService(homeDir)
    const cwdA = '/Users/liangkangda/Fe-project/code/cc-settings-preset'
    const cwdB = '/Users/liangkangda/Fe-project/code/cc-themes'

    await service.writeLastUsed(cwdA, 'work')
    await service.writeLastUsed(cwdB, 'base')

    expect(await service.readLastUsed(cwdA)).toBe('work')
    expect(await service.readLastUsed(cwdB)).toBe('base')
    expect(JSON.parse(await readFile(join(homeDir, '.ccsp', 'last-settings.json'), 'utf8'))).toEqual({
      [cwdA]: {
        presetName: 'work',
        updatedAt: expect.any(String),
      },
      [cwdB]: {
        presetName: 'base',
        updatedAt: expect.any(String),
      },
    })
  })

  it('returns undefined when a project has no record', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'ccsp-home-'))
    const service = createGlobalLastSettingsService(homeDir)

    expect(await service.readLastUsed('/Users/liangkangda/Fe-project/code/cc-settings-preset')).toBeUndefined()
  })
})
