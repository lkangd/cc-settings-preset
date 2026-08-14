import type { LaunchPresetSettings } from '../core/schema.js'
import { createLaunchPresetService } from './launch-preset-service.js'
import { copyPresetsInto, formatSeedReport } from './preset-import-service.js'
import { readWorktreeSeedMarker, resolveMainWorktreeRoot } from './worktree-service.js'

export type WorktreeSeedSource = {
  mainRoot: string
  presets: Array<{ name: string; settings: LaunchPresetSettings }>
  lastUsedName?: string
}

export type WorktreeSeedTarget = Pick<
  ReturnType<typeof createLaunchPresetService>,
  'listPresets' | 'createPreset' | 'writeLastUsed'
>

// Whether this checkout has anything to inherit, and from where. Every launch
// route has to ask the same question, and asking it here rather than in one
// TUI callback is what keeps a route from silently never asking at all.
//
// Only offered when this worktree has nothing of its own: once it has presets,
// the user has already made a decision here, and topping it up would only
// produce name collisions and surprises.
export async function resolveWorktreeSeedSource(
  cwd: string,
  target: WorktreeSeedTarget,
): Promise<WorktreeSeedSource | undefined> {
  if ((await target.listPresets()).length > 0) return undefined
  if (await readWorktreeSeedMarker(cwd)) return undefined

  const mainRoot = await resolveMainWorktreeRoot(cwd)
  if (!mainRoot) return undefined

  const mainService = createLaunchPresetService(mainRoot)
  const entries = await mainService.listPresetsWithSettings().catch(() => [])
  if (entries.length === 0) return undefined

  const lastUsedName = await mainService.readLastUsed().catch(() => undefined)
  return {
    mainRoot,
    presets: entries.map(entry => ({ name: entry.meta.name, settings: entry.settings })),
    ...(lastUsedName ? { lastUsedName } : {}),
  }
}

// Copies the source in and returns what to tell the user. The caller owns the
// output channel: the same result is worth printing to stderr from a direct
// launch and rendering inside a panel from an interactive one.
export async function seedWorktreePresets(
  source: WorktreeSeedSource,
  target: WorktreeSeedTarget,
): Promise<string[]> {
  const report = await copyPresetsInto(target, source.mainRoot, source.presets)

  // Only pointed at something that actually arrived: inheriting a pointer to a
  // preset that failed to copy would leave the worktree opening on a name it
  // does not have.
  if (source.lastUsedName && report.copied.includes(source.lastUsedName)) {
    await target.writeLastUsed(source.lastUsedName)
  }

  return formatSeedReport(report, source.presets.length, source.mainRoot)
}
