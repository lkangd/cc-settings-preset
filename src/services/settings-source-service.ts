import { pathExists, readJsonFile } from '../core/json.js'
import {
  resolveProjectClaudeLocalSettingsPath,
  resolveProjectClaudeSettingsPath,
  resolveUserClaudeSettingsPath,
  type PathContext,
} from '../core/paths.js'
import { parseSettings, type Settings } from '../core/schema.js'

export type SettingsSourceScope = 'project-local' | 'project' | 'user'

export type SettingsSource = {
  scope: SettingsSourceScope
  filePath: string
  settings: Settings
}

export function createSettingsSourceService(context: PathContext) {
  const candidates: Array<{ scope: SettingsSourceScope; filePath: string }> = [
    { scope: 'project-local', filePath: resolveProjectClaudeLocalSettingsPath(context.cwd) },
    { scope: 'project', filePath: resolveProjectClaudeSettingsPath(context.cwd) },
    { scope: 'user', filePath: resolveUserClaudeSettingsPath(context.homeDir) },
  ]

  return {
    async discoverSettingsSources(): Promise<SettingsSource[]> {
      const sources = await Promise.all(candidates.map(async candidate => {
        if (!(await pathExists(candidate.filePath))) return undefined
        return {
          scope: candidate.scope,
          filePath: candidate.filePath,
          settings: parseSettings(await readJsonFile(candidate.filePath)),
        }
      }))

      return sources.filter((source): source is SettingsSource => Boolean(source))
    },
  }
}
