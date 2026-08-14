import { execFile } from 'node:child_process'
import { dirname, isAbsolute, resolve } from 'node:path'
import { promisify } from 'node:util'

import { readJsonFileOrDefault, writeJsonFile } from '../core/json.js'
import { resolveWorktreeSeedMarkerPath } from '../core/paths.js'
import { worktreeSeedMarkerSchema, type WorktreeSeedMarker } from '../core/schema.js'
import { ensureProjectCcspStore } from './project-store-service.js'

const execFileAsync = promisify(execFile)

// `rev-parse` is a pure metadata read, but it still has to find and open the
// repository. Bounded so a stalled network filesystem cannot hold up startup.
const GIT_TIMEOUT_MS = 3000

// The main worktree's root, or `undefined` when this is not a linked worktree.
//
// Both readings are needed. `--git-common-dir` names the main repository's git
// directory from anywhere in the repo, so its parent is the main worktree's
// root; `--show-toplevel` names the root of *this* checkout. They differ only
// in a linked worktree — which is exactly the question. Comparing the common
// dir against `cwd/.git` instead would work only when cwd happens to be a
// worktree root, and would report every ordinary subdirectory of the main
// checkout as a linked worktree.
export async function resolveMainWorktreeRoot(cwd: string): Promise<string | undefined> {
  let stdout: string
  try {
    stdout = (await execFileAsync('git', ['rev-parse', '--git-common-dir', '--show-toplevel'], {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
    })).stdout
  } catch {
    // Not a repository, a bare one (which has no toplevel), git is absent, or
    // the call timed out. All of them mean "no main worktree to inherit from",
    // which is not an error worth raising.
    return undefined
  }

  const [rawCommonDir, rawToplevel] = stdout.trim().split('\n')
  if (!rawCommonDir || !rawToplevel) return undefined

  const commonDir = isAbsolute(rawCommonDir) ? rawCommonDir : resolve(cwd, rawCommonDir)
  const mainRoot = dirname(commonDir)
  // Same checkout — the main worktree, or any directory inside it.
  return mainRoot === resolve(rawToplevel) ? undefined : mainRoot
}

// A marker we cannot read is still a marker: treating it as absent would re-ask
// the question on every launch, and letting the failure escape would take the
// whole startup down over a file that only records a "no".
function unreadableMarker(): WorktreeSeedMarker {
  return { declined: true, mainRoot: '', at: new Date().toISOString() }
}

export async function readWorktreeSeedMarker(cwd: string): Promise<WorktreeSeedMarker | undefined> {
  let raw: unknown
  try {
    raw = await readJsonFileOrDefault(resolveWorktreeSeedMarkerPath(cwd), undefined)
  } catch {
    // Malformed JSON, or a file we lack permission to read. `readJsonFileOrDefault`
    // only treats a *missing* file as the default; everything else throws.
    return unreadableMarker()
  }

  if (raw === undefined) return undefined

  const parsed = worktreeSeedMarkerSchema.safeParse(raw)
  return parsed.success ? parsed.data : unreadableMarker()
}

export async function writeWorktreeSeedMarker(cwd: string, mainRoot: string): Promise<void> {
  await ensureProjectCcspStore(cwd)
  await writeJsonFile(resolveWorktreeSeedMarkerPath(cwd), {
    declined: true,
    mainRoot,
    at: new Date().toISOString(),
  } satisfies WorktreeSeedMarker)
}
