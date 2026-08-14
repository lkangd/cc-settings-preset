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
        origin: { kind: 'project', name: preset.name, path: sourcePath, at },
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
  return {
    kind: candidate.kind,
    name: candidate.presetName,
    ...(candidate.projectPath ? { path: candidate.projectPath } : {}),
    at,
  }
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
  const currentPath = resolve(input.cwd)

  const [templateEntries, projectPaths] = await Promise.all([
    templateService.listTemplatesWithSettings().catch(() => []),
    globalLastSettings.listProjectPaths().catch(() => []),
  ])

  const templates = templateEntries.map((entry): Omit<ImportCandidate, 'id'> => ({
    kind: 'template',
    presetName: entry.meta.name,
    settings: entry.settings,
    counts: countEntries(entry.settings),
  }))

  const scannable = projectPaths.filter(projectPath => resolve(projectPath) !== currentPath)
  const projectGroups = await Promise.all(scannable.map(async projectPath => {
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
