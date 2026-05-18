import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeJsonFile } from '../../src/core/json.js'
import { resolveIndexPath, resolvePresetPath } from '../../src/core/paths.js'
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

  it('keeps derived preset parent grouping after renaming the derived preset', async () => {
    const { service } = await createService()

    await service.createBasePreset('test', { model: 'opus' })
    const derived = await service.createDerivedPreset('test', 'work', {})

    const renamed = await service.renamePreset(derived.name, 'good')
    const presets = await service.listPresets()

    expect(renamed.type).toBe('derived')
    if (renamed.type !== 'derived') throw new Error('expected derived preset')
    expect(renamed.name).toBe('test-good')
    expect(renamed.parentName).toBe('test')
    expect(presets).toEqual([
      { type: 'base', name: 'test', fileName: 'test-settings.json', createdAt: expect.any(String), updatedAt: expect.any(String) },
      { type: 'derived', name: 'test-good', parentName: 'test', fileName: 'test-good-settings.json', createdAt: expect.any(String), updatedAt: expect.any(String) },
    ])
  })

  it('lists legacy derived presets after their parent base preset', async () => {
    const { root, service } = await createService()

    await writeJsonFile(resolvePresetPath(root, 'test-settings.json'), { model: 'opus' })
    await writeJsonFile(resolvePresetPath(root, 'good-settings.json'), { model: 'haiku' })
    await writeJsonFile(resolvePresetPath(root, 'test-test-settings.json'), { model: 'sonnet' })
    await writeJsonFile(resolveIndexPath(root), {
      version: 1,
      presets: {
        test: {
          type: 'base',
          name: 'test',
          fileName: 'test-settings.json',
          createdAt: '2026-05-18T02:30:13.669Z',
          updatedAt: '2026-05-18T02:30:13.669Z',
        },
        good: {
          type: 'derived',
          name: 'good',
          parentName: 'test',
          fileName: 'good-settings.json',
          createdAt: '2026-05-18T03:02:38.515Z',
          updatedAt: '2026-05-18T07:32:55.794Z',
        },
        'test-test': {
          type: 'derived',
          name: 'test-test',
          parentName: 'test',
          fileName: 'test-test-settings.json',
          createdAt: '2026-05-18T02:30:25.396Z',
          updatedAt: '2026-05-18T02:30:25.401Z',
        },
      },
    })

    expect((await service.listPresets()).map(preset => preset.name)).toEqual(['test', 'good', 'test-test'])
  })
})
