import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { resolveWorktreeSeedMarkerPath } from '../../src/core/paths.js'
import { ensureProjectCcspStore } from '../../src/services/project-store-service.js'
import {
  readWorktreeSeedMarker,
  resolveMainWorktreeRoot,
  writeWorktreeSeedMarker,
} from '../../src/services/worktree-service.js'

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

describe('resolveMainWorktreeRoot', () => {
  it('reports the main repository from inside a linked worktree', async () => {
    const { mainRoot, worktree } = await createRepoWithWorktree()

    expect(await resolveMainWorktreeRoot(worktree)).toBe(mainRoot)
  })

  it('reports nothing from the main worktree itself', async () => {
    const { mainRoot } = await createRepoWithWorktree()

    expect(await resolveMainWorktreeRoot(mainRoot)).toBeUndefined()
  })

  // An ordinary subdirectory is still the main worktree. Comparing the common
  // dir against `cwd/.git` passes at the root and fails everywhere below it,
  // which would offer to seed presets into `src/` on an ordinary launch.
  it('reports nothing from a subdirectory of the main worktree', async () => {
    const { mainRoot } = await createRepoWithWorktree()
    const nested = join(mainRoot, 'src', 'deep')
    await mkdir(nested, { recursive: true })

    expect(await resolveMainWorktreeRoot(nested)).toBeUndefined()
  })

  it('still reports the main repository from a subdirectory of a linked worktree', async () => {
    const { mainRoot, worktree } = await createRepoWithWorktree()
    const nested = join(worktree, 'src')
    await mkdir(nested, { recursive: true })

    expect(await resolveMainWorktreeRoot(nested)).toBe(mainRoot)
  })

  it('reports nothing outside a repository', async () => {
    const plainDir = await mkdtemp(join(tmpdir(), 'ccsp-plain-'))

    expect(await resolveMainWorktreeRoot(plainDir)).toBeUndefined()
  })
})

describe('worktree seed marker', () => {
  it('round-trips a declined answer', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-wt-marker-'))

    expect(await readWorktreeSeedMarker(cwd)).toBeUndefined()

    await writeWorktreeSeedMarker(cwd, '/repos/main')
    const marker = await readWorktreeSeedMarker(cwd)

    expect(marker?.declined).toBe(true)
    expect(marker?.mainRoot).toBe('/repos/main')
  })

  it('treats a schema-invalid marker as still answered', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-wt-marker-'))
    await ensureProjectCcspStore(cwd)
    await writeFile(resolveWorktreeSeedMarkerPath(cwd), '{"declined":"yes"}', 'utf8')

    expect((await readWorktreeSeedMarker(cwd))?.declined).toBe(true)
  })

  // Distinct from the case above: that one is valid JSON the schema rejects,
  // this one never parses at all. Reading it used to throw straight out of
  // startup, so a single corrupt byte made ccsp unusable in that worktree.
  it('treats a marker that is not valid JSON as still answered', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-wt-marker-'))
    await ensureProjectCcspStore(cwd)
    await writeFile(resolveWorktreeSeedMarkerPath(cwd), '{oops', 'utf8')

    expect((await readWorktreeSeedMarker(cwd))?.declined).toBe(true)
  })

  it('keeps the marker inside the ignored project store', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-wt-marker-'))

    expect(resolveWorktreeSeedMarkerPath(cwd)).toBe(join(cwd, '.claude', '.ccsp', 'worktree-seed.json'))
  })
})
