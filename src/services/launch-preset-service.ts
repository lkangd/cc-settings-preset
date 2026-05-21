import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { CliError } from '../core/errors.js'
import { pathExists, readJsonFile, writeJsonFile } from '../core/json.js'
import { buildLaunchPresetFileName, buildTempSettingsFileName, normalizePresetName, resolvePresetIndexKey } from '../core/name.js'
import {
  resolveProjectLastUsedPath,
  resolveProjectLaunchPresetIndexPath,
  resolveProjectLaunchPresetPath,
  resolveProjectTempSettingsPath,
} from '../core/paths.js'
import {
  createEmptyLaunchPresetIndex,
  lastUsedLaunchPresetSchema,
  launchPresetIndexSchema,
  parseLaunchPresetSettings,
  parseSettings,
  type LaunchPresetIndex,
  type LaunchPresetMeta,
  type LaunchPresetSettings,
  type Settings,
} from '../core/schema.js'
import { ensureProjectCcspStore } from './project-store-service.js'

function nowIso(): string {
  return new Date().toISOString()
}

export function createLaunchPresetService(cwd: string) {
  const indexPath = resolveProjectLaunchPresetIndexPath(cwd)
  const lastUsedPath = resolveProjectLastUsedPath(cwd)

  async function readIndex(): Promise<LaunchPresetIndex> {
    if (!(await pathExists(indexPath))) return createEmptyLaunchPresetIndex()
    return launchPresetIndexSchema.parse(await readJsonFile(indexPath))
  }

  async function writeIndex(index: LaunchPresetIndex): Promise<void> {
    await ensureProjectCcspStore(cwd)
    await writeJsonFile(indexPath, launchPresetIndexSchema.parse(index))
  }

  function getPresetPath(meta: LaunchPresetMeta): string {
    return resolveProjectLaunchPresetPath(cwd, meta.fileName)
  }

  async function readLastUsed(): Promise<string | undefined> {
    if (!(await pathExists(lastUsedPath))) return undefined
    const parsed = lastUsedLaunchPresetSchema.parse(await readJsonFile(lastUsedPath))
    const index = await readIndex()
    return index.presets[parsed.presetName] ? parsed.presetName : undefined
  }

  async function writeLastUsed(nameInput: string): Promise<void> {
    const index = await readIndex()
    const name = resolvePresetIndexKey(index.presets, nameInput)
    if (!name) throw new CliError(`Launch preset not found: ${nameInput}`)
    await ensureProjectCcspStore(cwd)
    await writeJsonFile(lastUsedPath, { presetName: name, updatedAt: nowIso() })
  }

  const service = {
    async listPresets(): Promise<LaunchPresetMeta[]> {
      const index = await readIndex()
      return Object.values(index.presets).sort((a, b) => a.name.localeCompare(b.name))
    },

    async readPresetSettings(nameInput: string): Promise<LaunchPresetSettings> {
      const index = await readIndex()
      const name = resolvePresetIndexKey(index.presets, nameInput)
      if (!name) throw new CliError(`Launch preset not found: ${nameInput}`)
      const meta = index.presets[name]
      if (!meta) throw new CliError(`Launch preset not found: ${nameInput}`)
      return parseLaunchPresetSettings(await readJsonFile(getPresetPath(meta)))
    },

    async createPreset(nameInput: string, settingsInput: unknown): Promise<LaunchPresetMeta> {
      const name = normalizePresetName(nameInput)
      const settings = parseLaunchPresetSettings(settingsInput)
      const index = await readIndex()
      if (index.presets[name]) throw new CliError(`Launch preset already exists: ${name}`)

      const timestamp = nowIso()
      const meta: LaunchPresetMeta = {
        name,
        fileName: buildLaunchPresetFileName(name),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      await ensureProjectCcspStore(cwd)
      await writeJsonFile(getPresetPath(meta), settings)
      index.presets[name] = meta
      await writeIndex(index)
      return meta
    },

    async writePresetSettings(nameInput: string, settingsInput: unknown): Promise<LaunchPresetMeta> {
      const index = await readIndex()
      const name = resolvePresetIndexKey(index.presets, nameInput)
      if (!name) throw new CliError(`Launch preset not found: ${nameInput}`)
      const settings = parseLaunchPresetSettings(settingsInput)
      const existing = index.presets[name]
      if (!existing) throw new CliError(`Launch preset not found: ${nameInput}`)

      const updated = { ...existing, updatedAt: nowIso() }
      await ensureProjectCcspStore(cwd)
      await writeJsonFile(getPresetPath(updated), settings)
      index.presets[name] = updated
      await writeIndex(index)
      return updated
    },

    async renamePreset(nameInput: string, newNameInput: string): Promise<LaunchPresetMeta> {
      const newName = normalizePresetName(newNameInput, { preserveCase: true })
      const index = await readIndex()
      const name = resolvePresetIndexKey(index.presets, nameInput)
      if (!name) throw new CliError(`Launch preset not found: ${nameInput}`)
      const existing = index.presets[name]
      if (!existing) throw new CliError(`Launch preset not found: ${nameInput}`)
      if (newName === name) {
        return { ...existing, updatedAt: nowIso() }
      }
      if (index.presets[newName]) throw new CliError(`Launch preset already exists: ${newName}`)

      const updated = {
        ...existing,
        name: newName,
        fileName: buildLaunchPresetFileName(newName, { preserveCase: true }),
        updatedAt: nowIso(),
      }

      await ensureProjectCcspStore(cwd)
      await fs.rename(getPresetPath(existing), resolveProjectLaunchPresetPath(cwd, updated.fileName))
      delete index.presets[name]
      index.presets[newName] = updated
      await writeIndex(index)

      const lastUsed = await readLastUsed()
      if (lastUsed === name) await writeLastUsed(newName)

      return updated
    },

    async deletePreset(nameInput: string): Promise<void> {
      const index = await readIndex()
      const name = resolvePresetIndexKey(index.presets, nameInput)
      if (!name) return
      const existing = index.presets[name]
      if (!existing) return

      try {
        await fs.unlink(getPresetPath(existing))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }

      delete index.presets[name]
      await writeIndex(index)
    },

    writeLastUsed,

    readLastUsed,

    async writeTempSettings(settingsInput: unknown, date = new Date()): Promise<string> {
      const settings = parseSettings(settingsInput) as Settings
      await ensureProjectCcspStore(cwd)
      const fileName = buildTempSettingsFileName(date)
      const filePath = resolveProjectTempSettingsPath(cwd, fileName)
      await writeJsonFile(filePath, settings)
      return filePath
    },

    async importExistingLaunchFile(filePath: string, nameInput?: string): Promise<LaunchPresetMeta> {
      const settings = parseLaunchPresetSettings(await readJsonFile(filePath))
      const name = nameInput ?? basename(filePath).replace(/-?launch\.json$/, '')
      return service.createPreset(name, settings)
    },
  }

  return service
}
