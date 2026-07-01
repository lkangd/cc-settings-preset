import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { createCcspConfigService } from '../../src/services/ccsp-config-service.js'

describe('ccsp config service', () => {
  it('returns defaults when no config file exists', async () => {
    const globalRoot = await mkdtemp(join(tmpdir(), 'ccsp-config-'))
    const service = createCcspConfigService(globalRoot)

    expect(await service.read()).toEqual({
      globalPresetEnvOnly: true,
      statusLineEnabled: true,
      settingsDisplayFormat: 'yaml',
      runMode: 'both',
      bannerEnabled: true,
    })
  })

  it('persists and reads back the written config', async () => {
    const globalRoot = await mkdtemp(join(tmpdir(), 'ccsp-config-'))
    const service = createCcspConfigService(globalRoot)

    await service.write({
      globalPresetEnvOnly: false,
      statusLineEnabled: false,
      settingsDisplayFormat: 'json',
      runMode: 'project-only',
      bannerEnabled: false,
    })

    expect(await service.read()).toEqual({
      globalPresetEnvOnly: false,
      statusLineEnabled: false,
      settingsDisplayFormat: 'json',
      runMode: 'project-only',
      bannerEnabled: false,
    })
    expect(JSON.parse(await readFile(join(globalRoot, 'config.json'), 'utf8'))).toEqual({
      globalPresetEnvOnly: false,
      statusLineEnabled: false,
      settingsDisplayFormat: 'json',
      runMode: 'project-only',
      bannerEnabled: false,
    })
  })

  it('toggles a single option via setOption, leaving others intact', async () => {
    const globalRoot = await mkdtemp(join(tmpdir(), 'ccsp-config-'))
    const service = createCcspConfigService(globalRoot)

    await service.setOption('statusLineEnabled', false)

    expect(await service.read()).toEqual({
      globalPresetEnvOnly: true,
      statusLineEnabled: false,
      settingsDisplayFormat: 'yaml',
      runMode: 'both',
      bannerEnabled: true,
    })
  })

  it('fills missing fields with defaults when reading a partial file', async () => {
    const globalRoot = await mkdtemp(join(tmpdir(), 'ccsp-config-'))
    const service = createCcspConfigService(globalRoot)

    await writeFile(join(globalRoot, 'config.json'), JSON.stringify({ globalPresetEnvOnly: false }), 'utf8')

    expect(await service.read()).toEqual({
      globalPresetEnvOnly: false,
      statusLineEnabled: true,
      settingsDisplayFormat: 'yaml',
      runMode: 'both',
      bannerEnabled: true,
    })
  })

  it('updates run mode via setOption', async () => {
    const globalRoot = await mkdtemp(join(tmpdir(), 'ccsp-config-'))
    const service = createCcspConfigService(globalRoot)

    await service.setOption('runMode', 'global-only')

    expect(await service.read()).toEqual({
      globalPresetEnvOnly: true,
      statusLineEnabled: true,
      settingsDisplayFormat: 'yaml',
      runMode: 'global-only',
      bannerEnabled: true,
    })
  })
})
