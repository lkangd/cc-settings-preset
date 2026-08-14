import { promises as fs } from 'node:fs'
import { basename } from 'node:path'

import { CliError, type CliErrorCode } from '../core/errors.js'
import { readJsonFile, readJsonFileOrDefault, writeJsonFile } from '../core/json.js'
import { buildLaunchPresetFileName, normalizePresetName, resolvePresetIndexKey } from '../core/name.js'
import {
  createEmptyLaunchPresetIndex,
  launchPresetIndexSchema,
  parseLaunchPresetSettings,
  type LaunchPresetIndex,
  type LaunchPresetMeta,
  type LaunchPresetSettings,
  type PresetOrigin,
} from '../core/schema.js'

// A directory of launch preset files plus the index that names them. Project
// launch presets and global templates are the same thing stored in two places,
// so both are built on this rather than on two copies of the same CRUD — the
// only differences are where the files live and what the errors are called.
export type LaunchPresetStoreOptions = {
  indexPath: string
  resolveFilePath: (fileName: string) => string
  // Runs before every write. Project stores use it to create directories and
  // drop their `.gitignore`; the global template store only needs the mkdir
  // that `writeJsonFile` already performs.
  ensureStore?: () => Promise<void>
  label: string
  notFoundCode: CliErrorCode
  existsCode: CliErrorCode
}

export type CreatePresetOptions = {
  origin?: PresetOrigin
}

function nowIso(): string {
  return new Date().toISOString()
}

export function createLaunchPresetStore(options: LaunchPresetStoreOptions) {
  const { indexPath, resolveFilePath, ensureStore, label, notFoundCode, existsCode } = options
  let indexPromise: Promise<LaunchPresetIndex> | undefined

  function invalidateIndex(): void {
    indexPromise = undefined
  }

  async function readIndexUncached(): Promise<LaunchPresetIndex> {
    return launchPresetIndexSchema.parse(await readJsonFileOrDefault(indexPath, createEmptyLaunchPresetIndex()))
  }

  async function readIndex(): Promise<LaunchPresetIndex> {
    if (!indexPromise) {
      indexPromise = readIndexUncached().catch(error => {
        indexPromise = undefined
        throw error
      })
    }

    return indexPromise
  }

  async function writeIndex(index: LaunchPresetIndex): Promise<void> {
    await ensureStore?.()
    await writeJsonFile(indexPath, launchPresetIndexSchema.parse(index))
    invalidateIndex()
  }

  // Every read, rename and unlink in this store goes through here, so this is
  // the one place that has to insist the index is naming a file *inside* the
  // store. `fileName` is always generated from a normalized name, but the index
  // is a plain JSON file on disk — and a hand-edited or foreign `../../thing`
  // would otherwise be read, moved or deleted outside the directory entirely.
  function getPresetPath(meta: LaunchPresetMeta): string {
    if (meta.fileName !== basename(meta.fileName) || meta.fileName === '.' || meta.fileName === '..') {
      throw new CliError(`${label} has an invalid file name: ${meta.fileName}`, 1, notFoundCode)
    }
    return resolveFilePath(meta.fileName)
  }

  async function resolveName(nameInput: string): Promise<string | undefined> {
    return resolvePresetIndexKey((await readIndex()).presets, nameInput)
  }

  async function readMeta(nameInput: string): Promise<LaunchPresetMeta | undefined> {
    const index = await readIndex()
    const name = resolvePresetIndexKey(index.presets, nameInput)
    return name ? index.presets[name] : undefined
  }

  async function requireMeta(nameInput: string): Promise<LaunchPresetMeta> {
    const meta = await readMeta(nameInput)
    if (!meta) throw new CliError(`${label} not found: ${nameInput}`, 1, notFoundCode)
    return meta
  }

  const store = {
    readIndex,
    invalidateIndex,
    getPresetPath,
    resolveName,
    readMeta,
    requireMeta,

    async listPresets(): Promise<LaunchPresetMeta[]> {
      const index = await readIndex()
      return Object.values(index.presets).sort((a, b) => a.name.localeCompare(b.name))
    },

    // Skips entries it cannot read instead of failing the whole list: the
    // callers are the import panel and worktree inheritance, both of which are
    // best-effort by design. One stale index entry or malformed file used to
    // take every other preset down with it.
    async listPresetsWithSettings(): Promise<Array<{ meta: LaunchPresetMeta; settings: LaunchPresetSettings }>> {
      const presets = await store.listPresets()
      const results = await Promise.allSettled(presets.map(async meta => ({
        meta,
        settings: parseLaunchPresetSettings(await readJsonFile(getPresetPath(meta))),
      })))
      return results.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))
    },

    async readPresetSettings(nameInput: string): Promise<LaunchPresetSettings> {
      const meta = await requireMeta(nameInput)
      return parseLaunchPresetSettings(await readJsonFile(getPresetPath(meta)))
    },

    async createPreset(
      nameInput: string,
      settingsInput: unknown,
      createOptions: CreatePresetOptions = {},
    ): Promise<LaunchPresetMeta> {
      const name = normalizePresetName(nameInput, { preserveCase: true })
      const settings = parseLaunchPresetSettings(settingsInput)
      const index = await readIndex()
      if (resolvePresetIndexKey(index.presets, name)) {
        throw new CliError(`${label} already exists: ${name}`, 1, existsCode)
      }

      const timestamp = nowIso()
      const meta: LaunchPresetMeta = {
        name,
        fileName: buildLaunchPresetFileName(name, { preserveCase: true }),
        createdAt: timestamp,
        updatedAt: timestamp,
        ...(createOptions.origin ? { origin: createOptions.origin } : {}),
      }

      await ensureStore?.()
      await writeJsonFile(getPresetPath(meta), settings)
      index.presets[name] = meta
      await writeIndex(index)
      return meta
    },

    async writePresetSettings(
      nameInput: string,
      settingsInput: unknown,
      createOptions: CreatePresetOptions = {},
    ): Promise<LaunchPresetMeta> {
      const index = await readIndex()
      const existing = await requireMeta(nameInput)
      const settings = parseLaunchPresetSettings(settingsInput)

      const updated: LaunchPresetMeta = {
        ...existing,
        updatedAt: nowIso(),
        ...(createOptions.origin ? { origin: createOptions.origin } : {}),
      }

      await ensureStore?.()
      await writeJsonFile(getPresetPath(updated), settings)
      index.presets[existing.name] = updated
      await writeIndex(index)
      return updated
    },

    async renamePreset(nameInput: string, newNameInput: string): Promise<LaunchPresetMeta> {
      const newName = normalizePresetName(newNameInput, { preserveCase: true })
      const index = await readIndex()
      const existing = await requireMeta(nameInput)
      if (newName === existing.name) {
        return { ...existing, updatedAt: nowIso() }
      }

      const conflictingKey = resolvePresetIndexKey(index.presets, newName)
      if (conflictingKey && conflictingKey !== existing.name) {
        throw new CliError(`${label} already exists: ${newName}`, 1, existsCode)
      }

      const updated: LaunchPresetMeta = {
        ...existing,
        name: newName,
        fileName: buildLaunchPresetFileName(newName, { preserveCase: true }),
        updatedAt: nowIso(),
      }

      await ensureStore?.()
      await fs.rename(getPresetPath(existing), getPresetPath(updated))
      delete index.presets[existing.name]
      index.presets[newName] = updated
      await writeIndex(index)
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
  }

  return store
}

export type LaunchPresetStore = ReturnType<typeof createLaunchPresetStore>
