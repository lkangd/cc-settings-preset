import { join } from 'node:path'

export type PathContext = {
  homeDir: string
  cwd: string
}

export function createPathContext(input?: Partial<PathContext>): PathContext {
  return {
    homeDir: input?.homeDir ?? process.env.HOME ?? process.cwd(),
    cwd: input?.cwd ?? process.cwd(),
  }
}

export function resolveGlobalRoot(homeDir = process.env.HOME ?? process.cwd()): string {
  return join(homeDir, '.ccsp')
}

export function resolveSettingsDir(globalRoot: string): string {
  return join(globalRoot, 'settings')
}

export function resolveIndexPath(globalRoot: string): string {
  return join(globalRoot, 'index.json')
}

export function resolvePresetPath(globalRoot: string, fileName: string): string {
  return join(resolveSettingsDir(globalRoot), fileName)
}

export function resolveUserClaudeSettingsPath(homeDir: string): string {
  return join(homeDir, '.claude', 'settings.json')
}

export function resolveProjectClaudeSettingsPath(cwd: string): string {
  return join(cwd, '.claude', 'settings.json')
}

export function resolveProjectClaudeLocalSettingsPath(cwd: string): string {
  return join(cwd, '.claude', 'settings.local.json')
}

export function resolveUserSkillsDir(homeDir: string): string {
  return join(homeDir, '.claude', 'skills')
}

export function resolveProjectSkillsDir(projectDir: string): string {
  return join(projectDir, '.claude', 'skills')
}

export function resolveProjectCommandsDir(projectDir: string): string {
  return join(projectDir, '.claude', 'commands')
}

export function resolveClaudePluginCacheDir(homeDir: string): string {
  return join(homeDir, '.claude', 'plugins', 'cache')
}
