import { promises as fs } from 'node:fs'

import { CliError } from '../core/errors.js'
import { pathExists, readJsonFile, writeJsonFile } from '../core/json.js'
import { buildSettingsFileName, derivePresetNameFromSettingsPath, normalizePresetName, resolvePresetIndexKey } from '../core/name.js'
import { resolveIndexPath, resolvePresetPath } from '../core/paths.js'
import {
  createEmptyIndex,
  indexSchema,
  parseSettings,
  type BasePresetMeta,
  type PresetIndex,
  type PresetMeta,
  type Settings,
} from '../core/schema.js'

export const CLAUDE_OFFICIAL_PRESET_NAME = '*Claude Official*'

export type ClaudeOfficialPresetItem = {
  name: string
  sourcePath: string
  settings: Settings
  temporary: true
}

function nowIso(): string {
  return new Date().toISOString()
}

export function createPresetService(globalRoot: string) {
  const indexPath = resolveIndexPath(globalRoot)

  async function readIndex(): Promise<PresetIndex> {
    if (!(await pathExists(indexPath))) return createEmptyIndex()
    return indexSchema.parse(await readJsonFile(indexPath))
  }

  async function writeIndex(index: PresetIndex): Promise<void> {
    await writeJsonFile(indexPath, indexSchema.parse(index))
  }

  function getPresetPath(meta: PresetMeta): string {
    return resolvePresetPath(globalRoot, meta.fileName)
  }

  async function readPresetSettings(name: string): Promise<Settings> {
    const index = await readIndex()
    const meta = index.presets[name]
    if (!meta) throw new CliError(`Preset not found: ${name}`)
    return parseSettings(await readJsonFile(getPresetPath(meta)))
  }

  async function writePresetSettings(meta: PresetMeta, settings: Settings): Promise<void> {
    await writeJsonFile(getPresetPath(meta), parseSettings(settings))
  }

  const service = {
    async getPresetPath(name: string): Promise<string> {
      const index = await readIndex()
      const meta = index.presets[name]
      if (!meta) throw new CliError(`Preset not found: ${name}`)
      return getPresetPath(meta)
    },

    async readIndex(): Promise<PresetIndex> {
      return readIndex()
    },

    async listPresets(): Promise<PresetMeta[]> {
      const index = await readIndex()
      return Object.values(index.presets)
        .filter((preset): preset is BasePresetMeta => preset.type === 'base')
        .sort((a, b) => a.name.localeCompare(b.name))
    },

    async readPresetSettings(name: string): Promise<Settings> {
      return readPresetSettings(name)
    },

    async createBasePreset(nameInput: string, settingsInput: unknown): Promise<BasePresetMeta> {
      const settings = parseSettings(settingsInput)
      const name = normalizePresetName(nameInput)
      const index = await readIndex()
      if (index.presets[name]) throw new CliError(`Preset already exists: ${name}`)

      const timestamp = nowIso()
      const meta: BasePresetMeta = {
        type: 'base',
        name,
        fileName: buildSettingsFileName(name),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      index.presets[name] = meta
      await writePresetSettings(meta, settings)
      await writeIndex(index)
      return meta
    },

    async writeBasePreset(nameInput: string, settingsInput: unknown): Promise<BasePresetMeta> {
      const settings = parseSettings(settingsInput)
      const index = await readIndex()
      const name = resolvePresetIndexKey(index.presets, nameInput)
      if (!name) throw new CliError(`Base preset not found: ${nameInput}`)
      const existing = index.presets[name]
      if (!existing || existing.type !== 'base') throw new CliError(`Base preset not found: ${nameInput}`)

      const updated: BasePresetMeta = { ...existing, updatedAt: nowIso() }
      index.presets[name] = updated
      await writePresetSettings(updated, settings)
      await writeIndex(index)
      return updated
    },

    async writePresetSettingsByName(nameInput: string, settingsInput: unknown): Promise<PresetMeta> {
      const settings = parseSettings(settingsInput)
      const index = await readIndex()
      const name = resolvePresetIndexKey(index.presets, nameInput)
      if (!name) throw new CliError(`Preset not found: ${nameInput}`)
      const existing = index.presets[name]
      if (!existing) throw new CliError(`Preset not found: ${nameInput}`)

      const updated: PresetMeta = { ...existing, updatedAt: nowIso() }
      index.presets[name] = updated
      await writePresetSettings(updated, settings)
      await writeIndex(index)
      return updated
    },


    async renamePreset(nameInput: string, newNameInput: string): Promise<PresetMeta> {
      const requestedName = normalizePresetName(newNameInput, { preserveCase: true })
      const index = await readIndex()
      const name = resolvePresetIndexKey(index.presets, nameInput)
      if (!name) throw new CliError(`Preset not found: ${nameInput}`)
      const meta = index.presets[name]
      if (!meta) throw new CliError(`Preset not found: ${nameInput}`)

      if (meta.type !== 'base') throw new CliError(`Base preset not found: ${nameInput}`)
      const newName = requestedName
      if (newName === name) {
        return { ...meta, updatedAt: nowIso() }
      }
      if (index.presets[newName]) throw new CliError(`Preset already exists: ${newName}`)

      const updated: PresetMeta = { ...meta, name: newName, fileName: buildSettingsFileName(newName, { preserveCase: true }), updatedAt: nowIso() }

      await fs.rename(getPresetPath(meta), resolvePresetPath(globalRoot, updated.fileName))
      delete index.presets[name]
      index.presets[newName] = updated

      await writeIndex(index)
      return updated
    },

    async deletePreset(nameInput: string): Promise<void> {
      const index = await readIndex()
      const name = resolvePresetIndexKey(index.presets, nameInput)
      if (!name) return
      const meta = index.presets[name]
      if (!meta) return

      try {
        await fs.unlink(getPresetPath(meta))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      delete index.presets[name]
      await writeIndex(index)
    },

    async importExistingSettingsFile(filePath: string, nameInput?: string): Promise<BasePresetMeta> {
      const settings = parseSettings(await readJsonFile(filePath))
      const baseName = nameInput ?? derivePresetNameFromSettingsPath(filePath)
      return service.createBasePreset(baseName, settings)
    },

    async buildClaudeOfficialItem(settingsPath: string): Promise<ClaudeOfficialPresetItem> {
      const settings = (await pathExists(settingsPath)) ? parseSettings(await readJsonFile(settingsPath)) : {}
      return {
        name: CLAUDE_OFFICIAL_PRESET_NAME,
        sourcePath: settingsPath,
        settings,
        temporary: true,
      }
    },
  }

  return service
}
