import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { ensureProjectCcspStore } from '../../src/services/project-store-service.js'

describe('ensureProjectCcspStore', () => {
  it('creates project ccsp directories and writes a local gitignore file', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    await writeFile(join(cwd, '.gitignore'), 'node_modules/\n', 'utf8')

    const store = await ensureProjectCcspStore(cwd)

    await expect(stat(store.rootDir)).resolves.toBeTruthy()
    await expect(stat(store.launchPresetDir)).resolves.toBeTruthy()
    await expect(stat(store.tempSettingsDir)).resolves.toBeTruthy()
    await expect(readFile(join(store.rootDir, '.gitignore'), 'utf8')).resolves.toBe('*\n')
    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).resolves.toBe('node_modules/\n')
  })

  it('rewrites the local gitignore file on repeated initialization', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))

    await ensureProjectCcspStore(cwd)
    await writeFile(join(cwd, '.claude', '.ccsp', '.gitignore'), 'keep-me\n', 'utf8')
    await ensureProjectCcspStore(cwd)

    expect(await readFile(join(cwd, '.claude', '.ccsp', '.gitignore'), 'utf8')).toBe('*\n')
  })

  it('creates the local gitignore file even when the project has none', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))

    const store = await ensureProjectCcspStore(cwd)

    await expect(readFile(join(cwd, '.gitignore'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(store.rootDir, '.gitignore'), 'utf8')).resolves.toBe('*\n')
  })
})
