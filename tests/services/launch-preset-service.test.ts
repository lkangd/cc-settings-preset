import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createLaunchPresetService } from '../../src/services/launch-preset-service.js'

describe('launch preset service', () => {
  it('creates, lists, reads, renames, and deletes project launch presets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    const created = await service.createPreset('Web Dev', {
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })

    expect(created.name).toBe('web-dev')
    expect(await service.listPresets()).toEqual([created])
    expect(await service.readPresetSettings('web-dev')).toEqual({
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })

    const renamed = await service.renamePreset('web-dev', 'Api Work')
    expect(renamed.name).toBe('Api-Work')
    expect(await service.listPresets()).toEqual([renamed])

    await service.deletePreset('api-work')
    expect(await service.listPresets()).toEqual([])
  })

  it('rejects duplicate project launch preset names', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.createPreset('web', {})

    await expect(service.createPreset('web', {})).rejects.toThrow('Launch preset already exists: web')
  })

  it('stores and resolves last-used launch preset', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.createPreset('web', {})
    await service.writeLastUsed('web')

    expect(await service.readLastUsed()).toBe('web')

    await service.deletePreset('web')

    expect(await service.readLastUsed()).toBeUndefined()
  })

  it('treats dot and hyphen normalized rename targets as the same preset', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.createPreset('gpt-5-4', {})
    const renamed = await service.renamePreset('gpt-5-4', 'gpt-5.4')

    expect(renamed.name).toBe('gpt-5.4')
    expect((await service.listPresets()).map(preset => preset.name)).toEqual(['gpt-5.4'])
  })

  it('writes retained temp settings files', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    const date = new Date('2026-05-19T08:07:06.000Z')

    const filePath = await service.writeTempSettings({ enabledPlugins: { alpha: true } }, date)

    expect(filePath).toContain('.claude/.ccsp/tmp/')
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ enabledPlugins: { alpha: true } })
  })
})
