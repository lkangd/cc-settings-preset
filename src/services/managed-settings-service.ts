import { promises as fs } from 'node:fs'
import { join } from 'node:path'

import { pathExists, readJsonFile } from '../core/json.js'
import {
  resolveManagedClaudeSettingsDropInDir,
  resolveManagedClaudeSettingsPath,
} from '../core/paths.js'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function mergeManagedValue(base: unknown, override: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(override)) {
    return [...new Set([...base, ...override])]
  }
  if (isPlainObject(base) && isPlainObject(override)) {
    const merged: Record<string, unknown> = { ...base }
    for (const [key, value] of Object.entries(override)) {
      merged[key] = key in merged ? mergeManagedValue(merged[key], value) : value
    }
    return merged
  }
  return override
}

function mergeManagedSettings(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    merged[key] = key in merged ? mergeManagedValue(merged[key], value) : value
  }
  return merged
}

async function readManagedDropInFragments(): Promise<Record<string, unknown>[]> {
  const dropInDir = resolveManagedClaudeSettingsDropInDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dropInDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const jsonFiles = entries
    .filter(entry => entry.endsWith('.json') && !entry.startsWith('.'))
    .sort((a, b) => a.localeCompare(b))

  const fragments = await Promise.all(
    jsonFiles.map(async fileName => readJsonFile(join(dropInDir, fileName))),
  )
  return fragments.filter(isPlainObject)
}

export async function readManagedSettings(): Promise<Record<string, unknown> | undefined> {
  const mainPath = resolveManagedClaudeSettingsPath()
  let merged: Record<string, unknown> = {}

  if (await pathExists(mainPath)) {
    const main = await readJsonFile(mainPath)
    if (isPlainObject(main)) merged = { ...main }
  }

  for (const fragment of await readManagedDropInFragments()) {
    merged = mergeManagedSettings(merged, fragment)
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}
