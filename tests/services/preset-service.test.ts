import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createPresetService } from '../../src/services/preset-service.js'

describe('preset service', () => {
  async function createService() {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-presets-'))
    return { root, service: createPresetService(root) }
  }

  it('creates and lists base presets', async () => {
    const { service } = await createService()

    await service.createBasePreset('Base', { model: 'claude-sonnet', enabledPlugins: { alpha: true } })
    const presets = await service.listPresets()

    expect(presets).toHaveLength(1)
    expect(presets[0]?.type).toBe('base')
    expect(presets[0]?.name).toBe('base')
  })

  it('creates derived presets as full settings copies', async () => {
    const { service } = await createService()

    await service.createBasePreset('base', { model: 'opus', env: { A: '1' }, enabledPlugins: { alpha: true } })
    const derived = await service.createDerivedPreset('base', 'work', {
      enabledPlugins: { alpha: false },
      skillOverrides: { legacy: 'off' },
    })
    const settings = await service.readPresetSettings(derived.name)

    expect(settings.model).toBe('opus')
    expect(settings.env).toEqual({ A: '1' })
    expect(settings.enabledPlugins).toEqual({ alpha: false })
    expect(settings.skillOverrides).toEqual({ legacy: 'off' })
  })

  it('finds existing derived presets by toggle state only', async () => {
    const { service } = await createService()

    await service.createBasePreset('base', { model: 'opus', enabledPlugins: { alpha: true } })
    const derived = await service.createDerivedPreset('base', 'work', {
      enabledPlugins: { alpha: false },
      skillOverrides: { legacy: 'off' },
    })

    const found = await service.findMatchingDerivedPreset('base', {
      enabledPlugins: { alpha: false },
      skillOverrides: { legacy: 'off' },
    })

    expect(found?.name).toBe(derived.name)
  })

  it('syncs derived presets from parent while preserving toggle fields', async () => {
    const { service } = await createService()

    await service.createBasePreset('base', { model: 'opus', env: { A: '1' }, enabledPlugins: { alpha: true } })
    const derived = await service.createDerivedPreset('base', 'work', {
      enabledPlugins: { alpha: false },
      skillOverrides: { legacy: 'off' },
    })

    await service.writeBasePreset('base', { model: 'sonnet', permissions: { allow: ['Bash(ls)'] }, enabledPlugins: { alpha: true, beta: true } })
    await service.syncDerivedPreset(derived.name)

    const settings = await service.readPresetSettings(derived.name)
    expect(settings.model).toBe('sonnet')
    expect(settings.permissions).toEqual({ allow: ['Bash(ls)'] })
    expect(settings.enabledPlugins).toEqual({ alpha: false })
    expect(settings.skillOverrides).toEqual({ legacy: 'off' })
  })

  it('writes updated settings for an existing derived preset by name', async () => {
    const { service } = await createService()

    await service.createBasePreset('base', { model: 'opus', enabledPlugins: { alpha: true } })
    const derived = await service.createDerivedPreset('base', 'work', {
      enabledPlugins: { alpha: false },
      skillOverrides: { legacy: 'off' },
    })

    const updated = await service.writePresetSettingsByName(derived.name, {
      enabledPlugins: { alpha: true },
      skillOverrides: { legacy: 'on', archive: 'off' },
    })

    expect(updated.updatedAt).toBeDefined()
    expect(await service.readPresetSettings(derived.name)).toEqual({
      enabledPlugins: { alpha: true },
      skillOverrides: { legacy: 'on', archive: 'off' },
    })
  })
})
