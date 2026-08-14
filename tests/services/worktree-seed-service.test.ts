import { execFile } from 'node:child_process'
import { mkdtemp, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { createLaunchPresetService } from '../../src/services/launch-preset-service.js'
import { writeWorktreeSeedMarker } from '../../src/services/worktree-service.js'
import { resolveWorktreeSeedSource, seedWorktreePresets } from '../../src/services/worktree-seed-service.js'

const execFileAsync = promisify(execFile)

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', [
    '-c', 'user.email=test@example.com',
    '-c', 'user.name=Test',
    '-c', 'commit.gpgsign=false',
    ...args,
  ], { cwd })
}

async function createRepoWithWorktree(): Promise<{ mainRoot: string; worktree: string }> {
  const mainRoot = await realpath(await mkdtemp(join(tmpdir(), 'ccsp-repo-')))
  await git(mainRoot, ['init', '-q', '--initial-branch=main', '.'])
  await git(mainRoot, ['commit', '-q', '--allow-empty', '-m', 'init'])

  const worktree = join(await realpath(await mkdtemp(join(tmpdir(), 'ccsp-wt-'))), 'feature')
  await git(mainRoot, ['worktree', 'add', '-q', worktree, '-b', 'feature'])

  return { mainRoot, worktree }
}

describe('resolveWorktreeSeedSource', () => {
  it('offers the main worktree presets to an empty linked worktree', async () => {
    const { mainRoot, worktree } = await createRepoWithWorktree()
    const main = createLaunchPresetService(mainRoot)
    await main.createPreset('web', { enabledPlugins: { alpha: false } })
    await main.writeLastUsed('web')

    const source = await resolveWorktreeSeedSource(worktree, createLaunchPresetService(worktree))

    expect(source?.mainRoot).toBe(mainRoot)
    expect(source?.presets.map(preset => preset.name)).toEqual(['web'])
    expect(source?.lastUsedName).toBe('web')
  })

  it('stays quiet once the worktree has presets of its own', async () => {
    const { mainRoot, worktree } = await createRepoWithWorktree()
    await createLaunchPresetService(mainRoot).createPreset('web', {})
    await createLaunchPresetService(worktree).createPreset('mine', {})

    expect(await resolveWorktreeSeedSource(worktree, createLaunchPresetService(worktree))).toBeUndefined()
  })

  it('stays quiet once the question has been declined here', async () => {
    const { mainRoot, worktree } = await createRepoWithWorktree()
    await createLaunchPresetService(mainRoot).createPreset('web', {})
    await writeWorktreeSeedMarker(worktree, mainRoot)

    expect(await resolveWorktreeSeedSource(worktree, createLaunchPresetService(worktree))).toBeUndefined()
  })

  it('stays quiet in the main checkout', async () => {
    const { mainRoot } = await createRepoWithWorktree()
    await createLaunchPresetService(mainRoot).createPreset('web', {})

    expect(await resolveWorktreeSeedSource(mainRoot, createLaunchPresetService(mainRoot))).toBeUndefined()
  })
})

describe('seedWorktreePresets', () => {
  it('copies the presets in and inherits the pointer', async () => {
    const { mainRoot, worktree } = await createRepoWithWorktree()
    const main = createLaunchPresetService(mainRoot)
    await main.createPreset('web', { enabledPlugins: { alpha: false } })
    await main.createPreset('api', {})
    await main.writeLastUsed('api')

    const target = createLaunchPresetService(worktree)
    const source = await resolveWorktreeSeedSource(worktree, target)
    const lines = await seedWorktreePresets(source!, target)

    expect((await target.listPresets()).map(preset => preset.name).sort()).toEqual(['api', 'web'])
    expect(await target.readLastUsed()).toBe('api')
    expect(lines[0]).toBe(`Inherited 2 of 2 presets from ${mainRoot}`)
  })

  it('keeps going past a preset it cannot copy and says which', async () => {
    const { mainRoot, worktree } = await createRepoWithWorktree()
    const main = createLaunchPresetService(mainRoot)
    await main.createPreset('web', {})
    await main.createPreset('api', {})

    const target = createLaunchPresetService(worktree)
    // Already taken here, so this one collides while the other still lands.
    await target.createPreset('web', {})

    const lines = await seedWorktreePresets(
      { mainRoot, presets: [{ name: 'web', settings: {} }, { name: 'api', settings: {} }] },
      target,
    )

    expect((await target.listPresets()).map(preset => preset.name).sort()).toEqual(['api', 'web'])
    expect(lines[0]).toBe(`Inherited 1 of 2 presets from ${mainRoot}`)
    expect(lines[1]).toContain('Skipped: web')
  })

  it('does not inherit a pointer to a preset that failed to arrive', async () => {
    const { mainRoot, worktree } = await createRepoWithWorktree()
    const target = createLaunchPresetService(worktree)
    await target.createPreset('web', {})

    await seedWorktreePresets(
      { mainRoot, presets: [{ name: 'web', settings: {} }], lastUsedName: 'web' },
      target,
    )

    // The pre-existing local `web` is a different preset; pointing at it would
    // be inheriting a decision that was never copied.
    expect(await target.readLastUsed()).toBeUndefined()
  })
})
