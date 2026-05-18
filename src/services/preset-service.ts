import { promises as fs } from 'node:fs'
import { basename } from 'node:path'

import { CliError } from '../core/errors.js'
import { pathExists, readJsonFile, writeJsonFile } from '../core/json.js'
import { buildDerivedFileName, buildSettingsFileName, normalizePresetName } from '../core/name.js'
import { resolveIndexPath, resolvePresetPath } from '../core/paths.js'
import {
  createEmptyIndex,
  indexSchema,
  parseSettings,
  type BasePresetMeta,
  type DerivedPresetMeta,
  type PresetIndex,
  type PresetMeta,
  type Settings,
  type SkillOverrideValue,
} from '../core/schema.js'

export type ToggleState = {
  enabledPlugins?: Record<string, boolean>
  skillOverrides?: Record<string, SkillOverrideValue>
}

function nowIso(): string {
  return new Date().toISOString()
}

function pickToggleState(settings: Settings): ToggleState {
  const state: ToggleState = {}
  if (settings.enabledPlugins) state.enabledPlugins = settings.enabledPlugins
  if (settings.skillOverrides) state.skillOverrides = settings.skillOverrides
  return state
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
}

function normalizeToggleState(state: ToggleState): ToggleState {
  const normalized: ToggleState = {}
  if (state.enabledPlugins && Object.keys(state.enabledPlugins).length > 0) {
    normalized.enabledPlugins = sortRecord(state.enabledPlugins)
  }
  if (state.skillOverrides && Object.keys(state.skillOverrides).length > 0) {
    normalized.skillOverrides = sortRecord(state.skillOverrides)
  }
  return normalized
}

function toggleStatesEqual(a: ToggleState, b: ToggleState): boolean {
  return JSON.stringify(normalizeToggleState(a)) === JSON.stringify(normalizeToggleState(b))
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
      return Object.values(index.presets).sort((a, b) => a.name.localeCompare(b.name))
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
      const name = normalizePresetName(nameInput)
      const settings = parseSettings(settingsInput)
      const index = await readIndex()
      const existing = index.presets[name]
      if (!existing || existing.type !== 'base') throw new CliError(`Base preset not found: ${name}`)

      const updated: BasePresetMeta = { ...existing, updatedAt: nowIso() }
      index.presets[name] = updated
      await writePresetSettings(updated, settings)
      await writeIndex(index)
      return updated
    },

    async writePresetSettingsByName(nameInput: string, settingsInput: unknown): Promise<PresetMeta> {
      const name = normalizePresetName(nameInput)
      const settings = parseSettings(settingsInput)
      const index = await readIndex()
      const existing = index.presets[name]
      if (!existing) throw new CliError(`Preset not found: ${name}`)

      const updated: PresetMeta = { ...existing, updatedAt: nowIso() }
      index.presets[name] = updated
      await writePresetSettings(updated, settings)
      await writeIndex(index)
      return updated
    },

    async createDerivedPreset(parentNameInput: string, derivedNameInput: string, toggles: ToggleState): Promise<DerivedPresetMeta> {
      const parentName = normalizePresetName(parentNameInput)
      const derivedSegment = normalizePresetName(derivedNameInput)
      const index = await readIndex()
      const parent = index.presets[parentName]
      if (!parent || parent.type !== 'base') throw new CliError(`Base preset not found: ${parentName}`)

      const name = normalizePresetName(`${parentName}-${derivedSegment}`)
      if (index.presets[name]) throw new CliError(`Preset already exists: ${name}`)

      const parentSettings = await readPresetSettings(parentName)
      const settings = parseSettings({
        ...parentSettings,
        ...normalizeToggleState(toggles),
      })
      const timestamp = nowIso()
      const meta: DerivedPresetMeta = {
        type: 'derived',
        name,
        parentName,
        fileName: buildDerivedFileName(parentName, derivedSegment),
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      index.presets[name] = meta
      await writePresetSettings(meta, settings)
      await writeIndex(index)
      return meta
    },

    async findMatchingDerivedPreset(parentNameInput: string, toggles: ToggleState): Promise<DerivedPresetMeta | undefined> {
      const parentName = normalizePresetName(parentNameInput)
      const index = await readIndex()
      const derivedPresets = Object.values(index.presets).filter(
        (meta): meta is DerivedPresetMeta => meta.type === 'derived' && meta.parentName === parentName,
      )

      for (const meta of derivedPresets) {
        const settings = await readPresetSettings(meta.name)
        if (toggleStatesEqual(pickToggleState(settings), toggles)) return meta
      }

      return undefined
    },

    async syncDerivedPreset(nameInput: string): Promise<DerivedPresetMeta> {
      const name = normalizePresetName(nameInput)
      const index = await readIndex()
      const meta = index.presets[name]
      if (!meta || meta.type !== 'derived') throw new CliError(`Derived preset not found: ${name}`)

      const parent = index.presets[meta.parentName]
      if (!parent || parent.type !== 'base') throw new CliError(`Parent preset missing for derived preset: ${name}`)

      const parentSettings = await readPresetSettings(parent.name)
      const currentSettings = await readPresetSettings(meta.name)
      const synced = parseSettings({
        ...parentSettings,
        ...normalizeToggleState(pickToggleState(currentSettings)),
      })
      const updated: DerivedPresetMeta = { ...meta, updatedAt: nowIso() }

      index.presets[name] = updated
      await writePresetSettings(updated, synced)
      await writeIndex(index)
      return updated
    },

    async renamePreset(nameInput: string, newNameInput: string): Promise<PresetMeta> {
      const name = normalizePresetName(nameInput)
      const newName = normalizePresetName(newNameInput)
      const index = await readIndex()
      const meta = index.presets[name]
      if (!meta) throw new CliError(`Preset not found: ${name}`)
      if (index.presets[newName]) throw new CliError(`Preset already exists: ${newName}`)

      const updated: PresetMeta = meta.type === 'base'
        ? { ...meta, name: newName, fileName: buildSettingsFileName(newName), updatedAt: nowIso() }
        : { ...meta, name: newName, fileName: buildSettingsFileName(newName), updatedAt: nowIso() }

      await fs.rename(getPresetPath(meta), resolvePresetPath(globalRoot, updated.fileName))
      delete index.presets[name]
      index.presets[newName] = updated

      if (meta.type === 'base') {
        for (const [key, candidate] of Object.entries(index.presets)) {
          if (candidate.type === 'derived' && candidate.parentName === name) {
            index.presets[key] = { ...candidate, parentName: newName, updatedAt: nowIso() }
          }
        }
      }

      await writeIndex(index)
      return updated
    },

    async deletePreset(nameInput: string): Promise<void> {
      const name = normalizePresetName(nameInput)
      const index = await readIndex()
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
      const baseName = nameInput ?? basename(filePath).replace(/-?settings\.json$/, '')
      return service.createBasePreset(baseName, settings)
    },
  }

  return service
}
