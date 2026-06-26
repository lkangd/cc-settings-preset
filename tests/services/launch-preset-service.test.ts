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

  it('lists launch presets together with settings in one call', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.createPreset('Web Dev', {
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })

    expect(await service.listPresetsWithSettings()).toEqual([
      {
        meta: expect.objectContaining({ name: 'Web-Dev', fileName: 'Web-Dev-launch.json' }),
        settings: {
          enabledPlugins: { alpha: false },
          skillOverrides: { personal: 'off' },
          deniedMcpServers: [{ serverName: 'github' }],
        },
      },
    ])
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

  it('writes retained temp settings files keyed by stem', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    const filePath = await service.writeTempSettings({ enabledPlugins: { alpha: true } }, 'session-stem')

    expect(filePath).toContain('.claude/.ccsp/tmp/')
    expect(filePath.endsWith('session-stem-settings.json')).toBe(true)
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ enabledPlugins: { alpha: true } })
  })

  it('prunes oldest temp settings when more than 50 files exist', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    for (let index = 0; index < 50; index += 1) {
      const fileName = `temp-${String(index).padStart(2, '0')}-settings.json`
      await writeFile(resolveProjectTempSettingsPath(cwd, fileName), '{}')
    }

    await service.writeTempSettings({}, 'zzz-newest')

    const tempDir = resolveProjectTempSettingsDir(cwd)
    const remaining = (await readdir(tempDir))
      .filter(fileName => fileName.endsWith('-settings.json'))
      .sort()

    expect(remaining).toHaveLength(50)
    expect(remaining).not.toContain('temp-00-settings.json')
    expect(remaining).toContain('temp-01-settings.json')
    expect(remaining).toContain('zzz-newest-settings.json')
  })

  it('never prunes the temp settings file it just wrote', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    for (let index = 0; index < 50; index += 1) {
      const fileName = `temp-${String(index).padStart(2, '0')}-settings.json`
      await writeFile(resolveProjectTempSettingsPath(cwd, fileName), '{}')
    }

    const filePath = await service.writeTempSettings({}, 'aaa-newest')

    const tempDir = resolveProjectTempSettingsDir(cwd)
    const remaining = (await readdir(tempDir))
      .filter(fileName => fileName.endsWith('-settings.json'))
      .sort()

    expect(remaining).toHaveLength(50)
    expect(remaining).toContain('aaa-newest-settings.json')
    await expect(readFile(filePath, 'utf8')).resolves.toBe('{}\n')
  })

  it('prunes related ccsp statusline scripts with oldest temp settings', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const oldestStem = 'aaa-oldest'
    const oldestSettings = `${oldestStem}-settings.json`
    await writeFile(resolveProjectTempSettingsPath(cwd, oldestSettings), '{}')
    await writeFile(resolveCcspStatuslineWrapperPath(cwd, oldestStem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingPath(cwd, oldestStem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingCommandPath(cwd, oldestStem), "echo 'old'\n")

    for (let index = 1; index < 50; index += 1) {
      const fileName = `temp-${String(index).padStart(2, '0')}-settings.json`
      await writeFile(resolveProjectTempSettingsPath(cwd, fileName), '{}')
    }

    await service.writeTempSettings({}, 'zzz-newest')

    const tempDir = resolveProjectTempSettingsDir(cwd)
    const remaining = await readdir(tempDir)

    expect(remaining).not.toContain(`ccsp-statusline-${oldestStem}.sh`)
    expect(remaining).not.toContain(`ccsp-statusline-underlying-${oldestStem}.sh`)
    expect(remaining).not.toContain(`ccsp-statusline-underlying-${oldestStem}.cmd`)
    expect(remaining).not.toContain(oldestSettings)
  })

  it('removes only scripts on exit and keeps the settings file', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    const stem = 'session-stem'

    const settingsPath = await service.writeTempSettings({ enabledPlugins: { alpha: true } }, stem)
    await writeFile(resolveCcspStatuslineWrapperPath(cwd, stem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingPath(cwd, stem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingCommandPath(cwd, stem), "echo 'underlying'\n")

    await service.cleanupTempScripts(stem)

    const tempDir = resolveProjectTempSettingsDir(cwd)
    expect(await readdir(tempDir)).toEqual([`${stem}-settings.json`])
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual({ enabledPlugins: { alpha: true } })
  })

  it('binds, reads, and re-touches session launch configs', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    const input = {
      sessionId: 'sess-a',
      globalName: 'work',
      projectPresetName: 'web',
      presetLabel: 'work/web',
      baseSettings: { permissions: { allow: ['Read(*)'] } },
      launchSettings: { enabledPlugins: { alpha: true } },
      toggles: { plugins: [], skills: [], mcps: [] },
    }

    await service.writeSessionBinding(input)
    const first = await service.readSessionBinding('sess-a')
    expect(first?.globalName).toBe('work')
    expect(first?.presetLabel).toBe('work/web')
    expect(first?.launchSettings).toEqual({ enabledPlugins: { alpha: true } })
    expect(first?.exitedAt).toBeUndefined()

    await service.recordSessionExit('sess-a')
    const exited = await service.readSessionBinding('sess-a')
    expect(exited?.exitedAt).toBeTruthy()

    await service.writeSessionBinding(input)
    const reused = await service.readSessionBinding('sess-a')
    expect(reused?.createdAt).toBe(first?.createdAt)
    expect(reused?.exitedAt).toBeUndefined()
  })

  it('keeps session bindings valid when preset labels are omitted', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.writeSessionBinding({
      sessionId: 'sess-a',
      globalName: 'work',
      projectPresetName: 'web',
      baseSettings: {},
      launchSettings: {},
      toggles: { plugins: [], skills: [], mcps: [] },
    })

    const binding = await service.readSessionBinding('sess-a')
    expect(binding?.presetLabel).toBeUndefined()
  })

  it('continues the most recently exited session', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    const base = {
      globalName: 'work',
      projectPresetName: 'web',
      presetLabel: 'work/web',
      baseSettings: {},
      launchSettings: {},
      toggles: { plugins: [], skills: [], mcps: [] },
    }

    await service.writeSessionBinding({ ...base, sessionId: 'sess-a' })
    await service.writeSessionBinding({ ...base, sessionId: 'sess-b' })

    // A launched first then B, but A exits first → --continue should pick A.
    await service.recordSessionExit('sess-a')

    const latest = await service.findLatestExitedSession()
    expect(latest?.sessionId).toBe('sess-a')
  })
})
