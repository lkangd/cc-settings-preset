import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSettingsSourceService } from '../../src/services/settings-source-service.js'

describe('settings source service', () => {
  it('discovers project local, project shared, and user settings in priority order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-sources-'))
    const home = join(root, 'home')
    const cwd = join(root, 'project')
    await mkdir(join(home, '.claude'), { recursive: true })
    await mkdir(join(cwd, '.claude'), { recursive: true })
    await writeFile(join(home, '.claude', 'settings.json'), '{}')
    await writeFile(join(cwd, '.claude', 'settings.json'), '{}')
    await writeFile(join(cwd, '.claude', 'settings.local.json'), '{}')

    const service = createSettingsSourceService({ homeDir: home, cwd })
    const sources = await service.discoverSettingsSources()

    expect(sources.map(source => source.scope)).toEqual(['project-local', 'project', 'user'])
  })
})
