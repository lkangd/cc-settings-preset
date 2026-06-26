import { promises as fs } from 'node:fs'

import { CliError } from '../core/errors.js'
import { readJsonFile, readJsonFileOrDefault, writeJsonFile } from '../core/json.js'
import {
  buildSettingsFileName,
  derivePresetNameFromSettingsPath,
  normalizePresetName,
  parseSettingsFileName,
  resolvePresetIndexKey,
} from '../core/name.js'
import { resolvePresetMetadataPath, resolvePresetPath, resolveSettingsDir } from '../core/paths.js'
import {
  parseSettings,
  presetIndexSchema,
  type BasePresetMeta,
  type PresetIndex,
  type Settings,
} from '../core/schema.js'

export const CLAUDE_OFFICIAL_PRESET_NAME = '*Claude Official*'

export type ClaudeOfficialPresetItem = {
  name: string
  sourcePath: string
  settings: Settings
  temporary: true
}

type PresetMetadataState = {
  version: 1
  presets: Record<string, BasePresetMeta>
}

type PresetLookup = {
  list: BasePresetMeta[]
  byName: Record<string, BasePresetMeta>
}

function nowIso(date = new Date()): string {
  return date.toISOString()
}

function createEmptyMetadataState(): PresetMetadataState {
  return { version: 1, presets: {} }
}

function sanitizePresetMeta(meta: BasePresetMeta): BasePresetMeta {
  return {
    type: 'base',
    name: meta.name,
    fileName: meta.fileName,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  }
}

function buildLookup(presets: BasePresetMeta[]): PresetLookup {
  const list = [...presets].sort((a, b) => a.name.localeCompare(b.name))
  return {
    list,
    byName: Object.fromEntries(list.map(preset => [preset.name, preset])),
  }
}

export function createPresetService(globalRoot: string) {
  const settingsDir = resolveSettingsDir(globalRoot)
  const metadataPath = resolvePresetMetadataPath(globalRoot)
  let presetLookupPromise: Promise<PresetLookup> | undefined

  function invalidatePresetLookup(): void {
    presetLookupPromise = undefined
  }

  async function readStoredMetadata(): Promise<PresetMetadataState> {
    const raw = await readJsonFileOrDefault(metadataPath, undefined)
    if (raw === undefined) return createEmptyMetadataState()

    const parsed = presetIndexSchema.safeParse(raw)
    if (!parsed.success) return createEmptyMetadataState()

    const version = parsed.data.version
    const rawPresets = parsed.data.presets

    const presets = Object.fromEntries(
      Object.entries(rawPresets).flatMap(([key, value]) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return []
        const preset = value as Partial<BasePresetMeta>
        if (preset.type !== 'base') return []
        if (typeof preset.name !== 'string' || typeof preset.fileName !== 'string') return []
        if (typeof preset.createdAt !== 'string' || typeof preset.updatedAt !== 'string') return []
        return [[key, sanitizePresetMeta(preset as BasePresetMeta)]]
      }),
    )

    return { version, presets }
  }

  async function writeStoredMetadata(state: PresetMetadataState): Promise<void> {
    await writeJsonFile(metadataPath, {
      version: 1,
      presets: Object.fromEntries(
        Object.entries(state.presets).map(([key, meta]) => [key, sanitizePresetMeta(meta)]),
      ),
    })
  }

  async function readPresetLookupUncached(): Promise<PresetLookup> {
    let entries: Array<{ name: string; isFile(): boolean; isSymbolicLink(): boolean }>
    try {
      entries = await fs.readdir(settingsDir, { withFileTypes: true, encoding: 'utf8' })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return buildLookup([])
      throw error
    }

    const stored = await readStoredMetadata()
    const discovered: BasePresetMeta[] = []
    let metadataChanged = false
    const liveNames = new Set<string>()

    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      const parsed = parseSettingsFileName(entry.name)
      if (!parsed) continue

      const filePath = resolvePresetPath(globalRoot, entry.name)
      let stats: Awaited<ReturnType<typeof fs.stat>>
      try {
        stats = await fs.stat(filePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }

      const existing = stored.presets[parsed.name]
      const updatedAt = nowIso(stats.mtime)
      const meta: BasePresetMeta = sanitizePresetMeta({
        type: 'base',
        name: parsed.name,
        fileName: entry.name,
        createdAt: existing?.fileName === entry.name ? existing.createdAt : updatedAt,
        updatedAt: existing?.fileName === entry.name ? existing.updatedAt : updatedAt,
      })

      if (!existing || existing.fileName !== meta.fileName) {
        stored.presets[meta.name] = meta
        metadataChanged = true
      }

      liveNames.add(meta.name)
      discovered.push(stored.presets[meta.name] ?? meta)
    }

    for (const name of Object.keys(stored.presets)) {
      if (liveNames.has(name)) continue
      delete stored.presets[name]
      metadataChanged = true
    }

    if (metadataChanged) {
      await writeStoredMetadata(stored)
    }

    return buildLookup(discovered.map(meta => stored.presets[meta.name] ?? meta))
  }

  async function readPresetLookup(): Promise<PresetLookup> {
    if (!presetLookupPromise) {
      presetLookupPromise = readPresetLookupUncached().catch(error => {
        presetLookupPromise = undefined
        throw error
      })
    }

    return presetLookupPromise
  }

  async function readIndex(): Promise<PresetIndex> {
    const lookup = await readPresetLookup()
    return {
      version: 1,
      presets: lookup.byName,
    }
  }

  function getPresetPath(fileName: string): string {
    return resolvePresetPath(globalRoot, fileName)
  }

  async function readPresetMeta(nameInput: string): Promise<BasePresetMeta | undefined> {
    const lookup = await readPresetLookup()
    const name = resolvePresetIndexKey(lookup.byName, nameInput)
    return name ? lookup.byName[name] : undefined
  }

  async function writeBasePresetMetadata(meta: BasePresetMeta): Promise<BasePresetMeta> {
    const state = await readStoredMetadata()
    state.presets[meta.name] = sanitizePresetMeta(meta)
    await writeStoredMetadata(state)
    invalidatePresetLookup()
    return state.presets[meta.name]!
  }

  async function deleteBasePresetMetadata(nameInput: string): Promise<void> {
    const state = await readStoredMetadata()
    const name = resolvePresetIndexKey(state.presets, nameInput)
    if (!name) return
    delete state.presets[name]
    await writeStoredMetadata(state)
    invalidatePresetLookup()
  }

  async function writePresetSettings(fileName: string, settings: Settings): Promise<void> {
    await writeJsonFile(getPresetPath(fileName), parseSettings(settings))
  }

  async function updateBasePreset(
    nameInput: string,
    settingsInput: unknown,
    notFoundMessage: (name: string) => string,
  ): Promise<BasePresetMeta> {
    const settings = parseSettings(settingsInput)
    const existing = await readPresetMeta(nameInput)
    if (!existing) throw new CliError(notFoundMessage(nameInput))

    await writePresetSettings(existing.fileName, settings)
    const updated = sanitizePresetMeta({ ...existing, updatedAt: nowIso() })
    return writeBasePresetMetadata(updated)
  }

  const service = {
    async getPresetPath(nameInput: string): Promise<string> {
      const meta = await readPresetMeta(nameInput)
      if (!meta) throw new CliError(`Preset not found: ${nameInput}`)
      return getPresetPath(meta.fileName)
    },

    async readIndex(): Promise<PresetIndex> {
      return readIndex()
    },

    async listPresets(): Promise<BasePresetMeta[]> {
      return (await readPresetLookup()).list
    },

    async listPresetsWithSettings(): Promise<Array<{ meta: BasePresetMeta; sourcePath: string; settings: Settings }>> {
      const lookup = await readPresetLookup()
      return Promise.all(lookup.list.map(async meta => {
        const sourcePath = getPresetPath(meta.fileName)
        return {
          meta,
          sourcePath,
          settings: parseSettings(await readJsonFile(sourcePath)),
        }
      }))
    },

    async readPresetSettings(nameInput: string): Promise<Settings> {
      const meta = await readPresetMeta(nameInput)
      if (!meta) throw new CliError(`Preset not found: ${nameInput}`)
      return parseSettings(await readJsonFile(getPresetPath(meta.fileName)))
    },

    async createBasePreset(nameInput: string, settingsInput: unknown): Promise<BasePresetMeta> {
      const settings = parseSettings(settingsInput)
      const name = normalizePresetName(nameInput)
      if (await readPresetMeta(name)) throw new CliError(`Preset already exists: ${name}`, 1, 'preset_already_exists')

      const timestamp = nowIso()
      const meta = await writeBasePresetMetadata({
        type: 'base',
        name,
        fileName: buildSettingsFileName(name),
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      await writePresetSettings(meta.fileName, settings)
      return meta
    },

    async writeBasePreset(nameInput: string, settingsInput: unknown): Promise<BasePresetMeta> {
      return updateBasePreset(nameInput, settingsInput, name => `Base preset not found: ${name}`)
    },

    async writePresetSettingsByName(nameInput: string, settingsInput: unknown): Promise<BasePresetMeta> {
      return updateBasePreset(nameInput, settingsInput, name => `Preset not found: ${name}`)
    },

    async renamePreset(nameInput: string, newNameInput: string): Promise<BasePresetMeta> {
      const requestedName = normalizePresetName(newNameInput, { preserveCase: true })
      const existing = await readPresetMeta(nameInput)
      if (!existing) throw new CliError(`Preset not found: ${nameInput}`)

      if (requestedName === existing.name) {
        return existing
      }

      const conflicting = await readPresetMeta(requestedName)
      if (conflicting && conflicting.name !== existing.name) {
        throw new CliError(`Preset already exists: ${requestedName}`, 1, 'preset_already_exists')
      }

      const updated = sanitizePresetMeta({
        ...existing,
        name: requestedName,
        fileName: buildSettingsFileName(requestedName, { preserveCase: true }),
        updatedAt: nowIso(),
      })

      await fs.rename(getPresetPath(existing.fileName), getPresetPath(updated.fileName))
      await deleteBasePresetMetadata(existing.name)
      return writeBasePresetMetadata(updated)
    },

    async deletePreset(nameInput: string): Promise<void> {
      const existing = await readPresetMeta(nameInput)
      if (!existing) return

      try {
        await fs.unlink(getPresetPath(existing.fileName))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }

      await deleteBasePresetMetadata(existing.name)
    },

    async importExistingSettingsFile(filePath: string, nameInput?: string): Promise<BasePresetMeta> {
      const settings = parseSettings(await readJsonFile(filePath))
      const baseName = nameInput ?? derivePresetNameFromSettingsPath(filePath)
      return service.createBasePreset(baseName, settings)
    },

    async buildClaudeOfficialItem(settingsPath: string): Promise<ClaudeOfficialPresetItem> {
      const settings = parseSettings(await readJsonFileOrDefault(settingsPath, {}))
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
