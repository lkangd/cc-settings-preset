import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { ensureProjectCcspStore } from '../../src/services/project-store-service.js'

describe('ensureProjectCcspStore', () => {
  it('creates project ccsp directories and adds gitignore entry', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    await writeFile(join(cwd, '.gitignore'), 'node_modules/\n', 'utf8')

    const store = await ensureProjectCcspStore(cwd)

    await expect(stat(store.rootDir)).resolves.toBeTruthy()
    await expect(stat(store.launchPresetDir)).resolves.toBeTruthy()
    await expect(stat(store.tempSettingsDir)).resolves.toBeTruthy()
    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('node_modules/\n.claude/.ccsp/\n')
  })

  it('does not duplicate an existing gitignore entry', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    await writeFile(join(cwd, '.gitignore'), '.claude/.ccsp/\n', 'utf8')

    await ensureProjectCcspStore(cwd)
    await ensureProjectCcspStore(cwd)

    expect(await readFile(join(cwd, '.gitignore'), 'utf8')).toBe('.claude/.ccsp/\n')
  })

  it('does not create gitignore when the project has none', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))

    await ensureProjectCcspStore(cwd)

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
