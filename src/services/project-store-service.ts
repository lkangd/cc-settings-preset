import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { pathExists } from '../core/json.js'
import {
  resolveProjectCcspRoot,
  resolveProjectLaunchPresetDir,
  resolveProjectTempSettingsDir,
} from '../core/paths.js'

export type ProjectCcspStore = {
  rootDir: string
  launchPresetDir: string
  tempSettingsDir: string
}

const ignoreEntry = '.claude/.ccsp/'

async function ensureGitignoreEntry(cwd: string): Promise<void> {
  const gitignorePath = join(cwd, '.gitignore')
  if (!(await pathExists(gitignorePath))) return

  const content = await fs.readFile(gitignorePath, 'utf8')
  const lines = content.split(/\r?\n/).filter(line => line.length > 0)
  if (lines.includes(ignoreEntry)) return

  const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n'
  await fs.writeFile(gitignorePath, `${content}${suffix}${ignoreEntry}\n`, 'utf8')
}

export async function ensureProjectCcspStore(cwd: string): Promise<ProjectCcspStore> {
  const rootDir = resolveProjectCcspRoot(cwd)
  const launchPresetDir = resolveProjectLaunchPresetDir(cwd)
  const tempSettingsDir = resolveProjectTempSettingsDir(cwd)

  await fs.mkdir(launchPresetDir, { recursive: true })
  await fs.mkdir(tempSettingsDir, { recursive: true })
  await ensureGitignoreEntry(cwd)

  return { rootDir, launchPresetDir, tempSettingsDir }
}
