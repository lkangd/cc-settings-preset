import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  resolveCcspStatuslineUnderlyingCommandPath,
  resolveCcspStatuslineUnderlyingPath,
  resolveCcspStatuslineWrapperPath,
  resolveProjectTempSettingsDir,
  resolveProjectTempSettingsPath,
} from '../../src/core/paths.js'
import { buildTempSettingsStem } from '../../src/core/name.js'
import { createLaunchPresetService } from '../../src/services/launch-preset-service.js'
import { ensureProjectCcspStore } from '../../src/services/project-store-service.js'

describe('launch preset service', () => {
  it('creates, lists, reads, renames, and deletes project launch presets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    const created = await service.createPreset('Web Dev', {
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })

    expect(created.name).toBe('Web-Dev')
    expect(created.fileName).toBe('Web-Dev-launch.json')
    expect(await service.listPresets()).toEqual([created])
    expect(await service.readPresetSettings('web-dev')).toEqual({
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })

    const renamed = await service.renamePreset('Web-Dev', 'Api Work')
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
    await expect(service.createPreset('Web', {})).rejects.toThrow('Launch preset already exists: Web')
  })

  it('preserves case when creating project launch presets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    const created = await service.createPreset('Expert', {})
    expect(created.name).toBe('Expert')
    expect(created.fileName).toBe('Expert-launch.json')
    expect((await service.listPresets()).map(preset => preset.name)).toEqual(['Expert'])
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

  it('prunes oldest temp settings when more than 20 files exist', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    for (let index = 0; index < 20; index += 1) {
      const fileName = `2026-05-01-00-00-${String(index).padStart(2, '0')}-settings.json`
      await writeFile(resolveProjectTempSettingsPath(cwd, fileName), '{}')
    }

    await service.writeTempSettings({}, new Date('2026-05-02T12:00:00.000Z'))

    const tempDir = resolveProjectTempSettingsDir(cwd)
    const remaining = (await readdir(tempDir))
      .filter(fileName => fileName.endsWith('-settings.json'))
      .sort()

    expect(remaining).toHaveLength(20)
    expect(remaining[0]).toBe('2026-05-01-00-00-01-settings.json')
    expect(remaining.at(-1)).toMatch(/^2026-05-02-\d{2}-\d{2}-\d{2}-settings\.json$/)
  })

  it('prunes related ccsp statusline artifacts with oldest temp settings', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const oldestStem = '2026-05-01-00-00-00'
    const oldestSettings = `${oldestStem}-settings.json`
    await writeFile(resolveProjectTempSettingsPath(cwd, oldestSettings), '{}')
    await writeFile(resolveCcspStatuslineWrapperPath(cwd, oldestStem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingPath(cwd, oldestStem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingCommandPath(cwd, oldestStem), "echo 'old'\n")

    for (let index = 1; index < 20; index += 1) {
      const fileName = `2026-05-01-00-00-${String(index).padStart(2, '0')}-settings.json`
      await writeFile(resolveProjectTempSettingsPath(cwd, fileName), '{}')
    }

    await service.writeTempSettings({}, new Date('2026-05-02T12:00:00.000Z'))

    const tempDir = resolveProjectTempSettingsDir(cwd)
    const remaining = await readdir(tempDir)

    expect(remaining).not.toContain(`ccsp-statusline-${oldestStem}.sh`)
    expect(remaining).not.toContain(`ccsp-statusline-underlying-${oldestStem}.sh`)
    expect(remaining).not.toContain(`ccsp-statusline-underlying-${oldestStem}.cmd`)
    expect(remaining).not.toContain(oldestSettings)
  })

  it('cleans up temp launch artifacts after Claude exits', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    const date = new Date('2026-05-22T12:00:00.000Z')
    const stem = buildTempSettingsStem(date)

    const settingsPath = await service.writeTempSettings({ enabledPlugins: { alpha: true } }, date)
    await writeFile(resolveCcspStatuslineWrapperPath(cwd, stem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingPath(cwd, stem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingCommandPath(cwd, stem), "echo 'underlying'\n")

    await service.cleanupTempLaunchArtifacts(settingsPath)

    const tempDir = resolveProjectTempSettingsDir(cwd)
    await expect(readdir(tempDir)).resolves.toEqual([])
  })
})
