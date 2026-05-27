import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CLAUDE_OFFICIAL_PRESET_NAME, createPresetService } from '../../src/services/preset-service.js'

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

  it('updates settings for an existing base preset by name', async () => {
    const { service } = await createService()

    await service.createBasePreset('base', { model: 'opus' })
    const updated = await service.writePresetSettingsByName('base', { model: 'sonnet' })

    expect(updated.updatedAt).toBeDefined()
    expect(await service.readPresetSettings('base')).toEqual({ model: 'sonnet' })
  })

  it('renames base presets', async () => {
    const { service } = await createService()

    await service.createBasePreset('base', { model: 'opus' })
    const renamed = await service.renamePreset('base', 'work')

    expect(renamed).toMatchObject({ type: 'base', name: 'work', fileName: 'work-settings.json' })
    expect((await service.listPresets()).map(preset => preset.name)).toEqual(['work'])
  })

  it('treats dot and hyphen normalized rename targets as the same preset', async () => {
    const { service } = await createService()

    await service.createBasePreset('gpt-5-4', { model: 'opus' })
    const renamed = await service.renamePreset('gpt-5-4', 'gpt-5.4')

    expect(renamed).toMatchObject({ type: 'base', name: 'gpt-5.4', fileName: 'gpt-5.4-settings.json' })
    expect((await service.listPresets()).map(preset => preset.name)).toEqual(['gpt-5.4'])
  })

  it('deletes base presets', async () => {
    const { service } = await createService()

    await service.createBasePreset('base', { model: 'opus' })
    await service.deletePreset('base')

    expect(await service.listPresets()).toEqual([])
  })

  it('builds a Claude official item from an existing settings file', async () => {
    const { root, service } = await createService()
    const settingsPath = join(root, 'settings.json')
    await writeFile(settingsPath, JSON.stringify({ model: 'opus' }), 'utf8')

    const item = await service.buildClaudeOfficialItem(settingsPath)

    expect(item).toEqual({
      name: CLAUDE_OFFICIAL_PRESET_NAME,
      sourcePath: settingsPath,
      settings: { model: 'opus' },
      temporary: true,
    })
  })

  it('builds a Claude official item with empty settings when the file is missing', async () => {
    const { root, service } = await createService()
    const settingsPath = join(root, 'missing.json')

    const item = await service.buildClaudeOfficialItem(settingsPath)

    expect(item).toEqual({
      name: CLAUDE_OFFICIAL_PRESET_NAME,
      sourcePath: settingsPath,
      settings: {},
      temporary: true,
    })
  })
})
