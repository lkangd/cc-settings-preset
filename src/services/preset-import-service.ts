import { promises as fs } from 'node:fs'
import { basename, resolve } from 'node:path'

import { resolveProjectLaunchPresetIndexPath, resolveProjectLaunchPresetPath } from '../core/paths.js'
import type { LaunchPresetSettings, PresetOrigin } from '../core/schema.js'
import { createGlobalLastSettingsService } from './global-last-settings-service.js'
import type { createLaunchPresetService } from './launch-preset-service.js'
import { createLaunchPresetStore } from './launch-preset-store.js'
import { createLaunchTemplateService } from './launch-template-service.js'

export type ImportCandidate = {
  // Stable for the lifetime of one panel session, and deliberately not derived
  // from the name: renaming a template inside the panel must not invalidate the
  // handle the panel is holding onto.
  id: string
  kind: 'template' | 'project'
  // Name of the source preset. Also the default name it lands under.
  presetName: string
  // Where it came from, for display: absent for templates.
  projectPath?: string
  projectLabel?: string
  settings: LaunchPresetSettings
  counts: { plugins: number; skills: number; mcps: number }
}

export type DiscoverImportCandidatesInput = {
  homeDir: string
  globalRoot: string
  cwd: string
}

function countEntries(settings: LaunchPresetSettings): ImportCandidate['counts'] {
  return {
    plugins: Object.keys(settings.enabledPlugins ?? {}).length,
    skills: Object.keys(settings.skillOverrides ?? {}).length,
    mcps: (settings.deniedMcpServers ?? []).length,
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory()
  } catch {
    return false
  }
}

// `resolve()` normalizes `.`, `..` and separators but not symlinks, so a
// project recorded under its real path and later entered through an alias
// compares as two different projects — and the current one shows up in its own
// candidate list. Falls back to the lexical form when the path cannot be
// resolved: something that does not exist is not the directory we are standing
// in either, and the comparison stays as good as it was before.
async function canonicalPath(path: string): Promise<string> {
  try {
    return await fs.realpath(path)
  } catch {
    return resolve(path)
  }
}

// Read-only view of another project's launch presets. The error codes are never
// surfaced: a project we merely browse is allowed to be broken, and the whole
// read is discarded if it is.
async function readProjectPresets(projectPath: string): Promise<Array<{ name: string; settings: LaunchPresetSettings }>> {
  const store = createLaunchPresetStore({
    indexPath: resolveProjectLaunchPresetIndexPath(projectPath),
    resolveFilePath: fileName => resolveProjectLaunchPresetPath(projectPath, fileName),
    label: 'Launch preset',
    notFoundCode: 'launch_preset_not_found',
    existsCode: 'launch_preset_already_exists',
  })

  try {
    return (await store.listPresetsWithSettings()).map(entry => ({
      name: entry.meta.name,
      settings: entry.settings,
    }))
  } catch {
    return []
  }
}

export type SeedReport = {
  copied: string[]
  skipped: Array<{ name: string; reason: string }>
}

// Deliberately the caller's service rather than one built here: the store
// caches its index, so writing through a second instance leaves the caller
// holding a stale copy — and the caller's very next act is to look one of these
// presets up by name.
export type LaunchPresetWriter = Pick<ReturnType<typeof createLaunchPresetService>, 'createPreset'>

// Both ways a preset can arrive here — copied wholesale from a main worktree,
// or picked one at a time out of the import panel — stamp the same provenance,
// so there is one place that decides what "where this came from" looks like.
function buildOrigin(kind: PresetOrigin['kind'], name: string, path: string | undefined, at: string): PresetOrigin {
  return { kind, name, ...(path ? { path } : {}), at }
}

// Copies a set of presets into a project one at a time, keeping going past a
// failure. These are plain file writes and idempotent, so a partial result is
// something the user can simply retry — whereas a rollback has its own failure
// mode, and one that leaves nothing behind to inspect.
export async function copyPresetsInto(
  service: LaunchPresetWriter,
  sourcePath: string,
  presets: Array<{ name: string; settings: LaunchPresetSettings }>,
  at = new Date().toISOString(),
): Promise<SeedReport> {
  const report: SeedReport = { copied: [], skipped: [] }

  for (const preset of presets) {
    try {
      await service.createPreset(preset.name, preset.settings, {
        origin: buildOrigin('project', preset.name, sourcePath, at),
      })
      report.copied.push(preset.name)
    } catch (error) {
      report.skipped.push({
        name: preset.name,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return report
}

export function formatSeedReport(report: SeedReport, total: number, sourcePath: string): string[] {
  const lines = [`Inherited ${report.copied.length} of ${total} presets from ${sourcePath}`]
  if (report.skipped.length > 0) {
    lines.push(`Skipped: ${report.skipped.map(entry => `${entry.name} (${entry.reason})`).join(', ')}`)
  }
  return lines
}

export function buildImportOrigin(candidate: ImportCandidate, at = new Date().toISOString()): PresetOrigin {
  return buildOrigin(candidate.kind, candidate.presetName, candidate.projectPath, at)
}

export type ImportTargetWriter = Pick<
  ReturnType<typeof createLaunchPresetService>,
  'createPreset' | 'writePresetSettings'
>

// Landing a candidate in a project is a single decision — which write, under
// which name, carrying which provenance — and it belongs beside the discovery
// that produced the candidate rather than in whichever panel callback happens
// to trigger it. Conflicts are left to throw: the caller is the only one that
// knows whether it can offer the user a way out.
export async function importCandidateInto(
  service: ImportTargetWriter,
  candidate: ImportCandidate,
  targetName: string,
  options: { overwrite?: boolean } = {},
): Promise<void> {
  const origin = buildImportOrigin(candidate)
  if (options.overwrite) {
    await service.writePresetSettings(targetName, candidate.settings, { origin })
    return
  }
  await service.createPreset(targetName, candidate.settings, { origin })
}

// Everything the current project could import, in one pass. Scanning the whole
// recent-project list up front (rather than lazily, per selection) is affordable
// because the list is short and each entry is a small JSON read; doing it here
// also means the panel never shows a candidate that turns out to be empty.
export async function discoverImportCandidates(
  input: DiscoverImportCandidatesInput,
): Promise<ImportCandidate[]> {
  const templateService = createLaunchTemplateService(input.globalRoot)
  const globalLastSettings = createGlobalLastSettingsService(input.homeDir)

  const [currentPath, templateEntries, projectPaths] = await Promise.all([
    canonicalPath(input.cwd),
    templateService.listTemplatesWithSettings().catch(() => []),
    globalLastSettings.listProjectPaths().catch(() => []),
  ])

  const templates = templateEntries.map((entry): Omit<ImportCandidate, 'id'> => ({
    kind: 'template',
    presetName: entry.meta.name,
    settings: entry.settings,
    counts: countEntries(entry.settings),
  }))

  const projectGroups = await Promise.all(projectPaths.map(async projectPath => {
    if (await canonicalPath(projectPath) === currentPath) return []
    if (!await isDirectory(projectPath)) return []
    return (await readProjectPresets(projectPath)).map((preset): Omit<ImportCandidate, 'id'> => ({
      kind: 'project',
      presetName: preset.name,
      projectPath,
      projectLabel: basename(projectPath),
      settings: preset.settings,
      counts: countEntries(preset.settings),
    }))
  }))

  return [...templates, ...projectGroups.flat()].map((candidate, index) => ({
    id: `candidate-${index}`,
    ...candidate,
  }))
}
