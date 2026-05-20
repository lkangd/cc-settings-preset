import { promises as fs } from 'node:fs'
import { join } from 'node:path'
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

async function ensureStoreGitignore(rootDir: string): Promise<void> {
  await fs.writeFile(join(rootDir, '.gitignore'), '*\n', 'utf8')
}

export async function ensureProjectCcspStore(cwd: string): Promise<ProjectCcspStore> {
  const rootDir = resolveProjectCcspRoot(cwd)
  const launchPresetDir = resolveProjectLaunchPresetDir(cwd)
  const tempSettingsDir = resolveProjectTempSettingsDir(cwd)

  await fs.mkdir(launchPresetDir, { recursive: true })
  await fs.mkdir(tempSettingsDir, { recursive: true })
  await ensureStoreGitignore(rootDir)

  return { rootDir, launchPresetDir, tempSettingsDir }
}
