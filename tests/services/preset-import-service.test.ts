import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { resolveGlobalLastSettingsPath } from '../../src/core/paths.js'
import type { LaunchPresetSettings } from '../../src/core/schema.js'
import { createLaunchPresetService } from '../../src/services/launch-preset-service.js'
import { createLaunchTemplateService } from '../../src/services/launch-template-service.js'
import {
  buildImportOrigin,
  copyPresetsInto,
  discoverImportCandidates,
  formatSeedReport,
  type ImportCandidate,
} from '../../src/services/preset-import-service.js'

type Fixture = {
  homeDir: string
  globalRoot: string
  cwd: string
}

async function createFixture(): Promise<Fixture> {
  const homeDir = await mkdtemp(join(tmpdir(), 'ccsp-home-'))
  const globalRoot = join(homeDir, '.ccsp')
  const cwd = await mkdtemp(join(tmpdir(), 'ccsp-current-'))
  return { homeDir, globalRoot, cwd }
}

async function writeRecentProjects(homeDir: string, paths: string[]): Promise<void> {
  const filePath = resolveGlobalLastSettingsPath(homeDir)
  await mkdir(join(filePath, '..'), { recursive: true })
  await writeFile(filePath, JSON.stringify(Object.fromEntries(paths.map((path, index) => [
    path,
    { presetName: 'base', updatedAt: `2026-08-${String(10 + index).padStart(2, '0')}T00:00:00.000Z` },
  ]))), 'utf8')
}

async function createProjectWithPreset(
  name: string,
  presetName: string,
  settings: LaunchPresetSettings = {},
): Promise<string> {
  const projectPath = await mkdtemp(join(tmpdir(), `ccsp-${name}-`))
  await createLaunchPresetService(projectPath).createPreset(presetName, settings)
  return projectPath
}

describe('import candidate discovery', () => {
  it('offers global templates and presets from recent projects', async () => {
    const { homeDir, globalRoot, cwd } = await createFixture()
    await createLaunchTemplateService(globalRoot).promote('shared', { enabledPlugins: { alpha: false } }, {
      kind: 'project',
      name: 'shared',
      at: '2026-08-13T00:00:00.000Z',
    })
    const projectPath = await createProjectWithPreset('web', 'web-dev')
    await writeRecentProjects(homeDir, [projectPath])

    const candidates = await discoverImportCandidates({ homeDir, globalRoot, cwd })

    expect(candidates.map(candidate => [candidate.kind, candidate.presetName])).toEqual([
      ['template', 'shared'],
      ['project', 'web-dev'],
    ])
    expect(candidates[1]?.projectPath).toBe(projectPath)
  })

  it('never offers the project it is being run from', async () => {
    const { homeDir, globalRoot, cwd } = await createFixture()
    await createLaunchPresetService(cwd).createPreset('local-only', {})
    await writeRecentProjects(homeDir, [cwd])

    expect(await discoverImportCandidates({ homeDir, globalRoot, cwd })).toEqual([])
  })

  it('never offers the current project reached through a symlink', async () => {
    const { homeDir, globalRoot } = await createFixture()
    // The recorded path is the real one; the user is standing in an alias of it.
    // A lexical comparison sees two different projects and lets this project
    // import itself.
    const realPath = await realpath(await mkdtemp(join(tmpdir(), 'ccsp-real-')))
    const aliasPath = join(await mkdtemp(join(tmpdir(), 'ccsp-alias-')), 'link')
    await symlink(realPath, aliasPath)
    await createLaunchPresetService(realPath).createPreset('local-only', {})
    await writeRecentProjects(homeDir, [realPath])

    expect(await discoverImportCandidates({ homeDir, globalRoot, cwd: aliasPath })).toEqual([])
  })

  it('skips recent projects whose directory is gone', async () => {
    const { homeDir, globalRoot, cwd } = await createFixture()
    await writeRecentProjects(homeDir, [join(tmpdir(), 'ccsp-deleted-project-that-never-existed')])

    expect(await discoverImportCandidates({ homeDir, globalRoot, cwd })).toEqual([])
  })

  it('skips recent projects that have no presets of their own', async () => {
    const { homeDir, globalRoot, cwd } = await createFixture()
    const emptyProject = await mkdtemp(join(tmpdir(), 'ccsp-empty-'))
    await writeRecentProjects(homeDir, [emptyProject])

    expect(await discoverImportCandidates({ homeDir, globalRoot, cwd })).toEqual([])
  })

  it('counts what each candidate would bring', async () => {
    const { homeDir, globalRoot, cwd } = await createFixture()
    const projectPath = await createProjectWithPreset('web', 'web-dev', {
      enabledPlugins: { alpha: false, beta: false },
      skillOverrides: { review: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })
    await writeRecentProjects(homeDir, [projectPath])

    const [candidate] = await discoverImportCandidates({ homeDir, globalRoot, cwd })

    expect(candidate?.counts).toEqual({ plugins: 2, skills: 1, mcps: 1 })
  })

  it('gives every candidate a distinct id', async () => {
    const { homeDir, globalRoot, cwd } = await createFixture()
    await createLaunchTemplateService(globalRoot).promote('shared', {}, {
      kind: 'project',
      name: 'shared',
      at: '2026-08-13T00:00:00.000Z',
    })
    const first = await createProjectWithPreset('web', 'web-dev')
    const second = await createProjectWithPreset('api', 'web-dev')
    await writeRecentProjects(homeDir, [first, second])

    const candidates = await discoverImportCandidates({ homeDir, globalRoot, cwd })
    const ids = candidates.map(candidate => candidate.id)

    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
  })
})

describe('buildImportOrigin', () => {
  it('records a template source without a path', () => {
    const candidate: ImportCandidate = {
      id: 'candidate-0',
      kind: 'template',
      presetName: 'shared',
      settings: {},
      counts: { plugins: 0, skills: 0, mcps: 0 },
    }

    expect(buildImportOrigin(candidate, '2026-08-13T00:00:00.000Z')).toEqual({
      kind: 'template',
      name: 'shared',
      at: '2026-08-13T00:00:00.000Z',
    })
  })

  it('records which project a cross-project import came from', () => {
    const candidate: ImportCandidate = {
      id: 'candidate-1',
      kind: 'project',
      presetName: 'web-dev',
      projectPath: '/projects/web',
      projectLabel: 'web',
      settings: {},
      counts: { plugins: 0, skills: 0, mcps: 0 },
    }

    expect(buildImportOrigin(candidate, '2026-08-13T00:00:00.000Z')).toEqual({
      kind: 'project',
      name: 'web-dev',
      path: '/projects/web',
      at: '2026-08-13T00:00:00.000Z',
    })
  })
})

describe('copyPresetsInto', () => {
  it('copies every preset and records where they came from', async () => {
    const target = await mkdtemp(join(tmpdir(), 'ccsp-target-'))
    const service = createLaunchPresetService(target)

    const report = await copyPresetsInto(service, '/repos/main', [
      { name: 'web-dev', settings: { enabledPlugins: { alpha: false } } },
      { name: 'debug', settings: {} },
    ], '2026-08-13T00:00:00.000Z')

    expect(report).toEqual({ copied: ['web-dev', 'debug'], skipped: [] })
    expect((await service.listPresets()).map(preset => preset.name).sort()).toEqual(['debug', 'web-dev'])
    expect(await service.readPresetSettings('web-dev')).toEqual({ enabledPlugins: { alpha: false } })
    expect((await service.listPresets())[0]?.origin).toEqual({
      kind: 'project',
      name: 'debug',
      path: '/repos/main',
      at: '2026-08-13T00:00:00.000Z',
    })
  })

  // The caller reads the index before seeding (to decide whether to seed at
  // all) and again afterwards (to inherit the last-used pointer). Writing
  // through a service of our own leaves that first, empty reading cached, and
  // the lookup afterwards fails on a preset that is sitting right there on disk.
  it('leaves the caller able to find what was just copied', async () => {
    const target = await mkdtemp(join(tmpdir(), 'ccsp-target-'))
    const service = createLaunchPresetService(target)

    expect(await service.listPresets()).toEqual([])

    await copyPresetsInto(service, '/repos/main', [{ name: 'debug', settings: {} }])

    await expect(service.writeLastUsed('debug')).resolves.toBeUndefined()
    expect(await service.readLastUsed()).toBe('debug')
  })

  it('keeps going past a preset it cannot copy', async () => {
    const target = await mkdtemp(join(tmpdir(), 'ccsp-target-'))
    const service = createLaunchPresetService(target)
    await service.createPreset('web-dev', { enabledPlugins: { local: false } })

    const report = await copyPresetsInto(service, '/repos/main', [
      { name: 'web-dev', settings: {} },
      { name: 'debug', settings: {} },
    ])

    expect(report.copied).toEqual(['debug'])
    expect(report.skipped).toHaveLength(1)
    expect(report.skipped[0]?.name).toBe('web-dev')
    expect(report.skipped[0]?.reason).toContain('already exists')
  })

  it('never overwrites a preset the target already had', async () => {
    const target = await mkdtemp(join(tmpdir(), 'ccsp-target-'))
    const service = createLaunchPresetService(target)
    await service.createPreset('web-dev', { enabledPlugins: { local: false } })

    await copyPresetsInto(service, '/repos/main', [
      { name: 'web-dev', settings: { enabledPlugins: { remote: false } } },
    ])

    expect(await service.readPresetSettings('web-dev')).toEqual({ enabledPlugins: { local: false } })
  })
})

describe('formatSeedReport', () => {
  it('reports a clean run in one line', () => {
    expect(formatSeedReport({ copied: ['a', 'b'], skipped: [] }, 2, '/repos/main'))
      .toEqual(['Inherited 2 of 2 presets from /repos/main'])
  })

  it('names what was skipped and why', () => {
    const lines = formatSeedReport(
      { copied: ['a'], skipped: [{ name: 'b', reason: 'Launch preset already exists: b' }] },
      2,
      '/repos/main',
    )

    expect(lines[0]).toBe('Inherited 1 of 2 presets from /repos/main')
    expect(lines[1]).toBe('Skipped: b (Launch preset already exists: b)')
  })
})
