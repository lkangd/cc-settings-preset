import { join } from 'node:path'

export type PathContext = {
  homeDir: string
  cwd: string
}

export function normalizeInputPath(input: string): string {
  let value = input.trim()
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1).trim()
  }
  return value
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

function resolveSettingsDir(globalRoot: string): string {
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

export function resolveProjectCcspRoot(cwd: string): string {
  return join(cwd, '.claude', '.ccsp')
}

export function resolveProjectLaunchPresetDir(projectRoot: string): string {
  return join(resolveProjectCcspRoot(projectRoot), 'launch-presets')
}

export function resolveProjectLaunchPresetIndexPath(projectRoot: string): string {
  return join(resolveProjectLaunchPresetDir(projectRoot), 'index.json')
}

export function resolveProjectLaunchPresetPath(projectRoot: string, fileName: string): string {
  return join(resolveProjectLaunchPresetDir(projectRoot), fileName)
}

export function resolveProjectLastUsedPath(projectRoot: string): string {
  return join(resolveProjectCcspRoot(projectRoot), 'last-used.json')
}

export function resolveProjectTempSettingsDir(projectRoot: string): string {
  return join(resolveProjectCcspRoot(projectRoot), 'tmp')
}

export function resolveProjectTempSettingsPath(projectRoot: string, fileName: string): string {
  return join(resolveProjectTempSettingsDir(projectRoot), fileName)
}

export function resolveProjectMcpPath(projectRoot: string): string {
  return join(projectRoot, '.mcp.json')
}

export function resolveUserClaudeJsonPath(homeDir: string): string {
  return join(homeDir, '.claude.json')
}

export function resolveGlobalLastSettingsPath(globalRoot: string): string {
  return join(globalRoot, '.ccsp', 'last-settings.json')
}
