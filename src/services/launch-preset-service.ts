import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { CliError } from '../core/errors.js'
import { pathExists, readJsonFile, writeJsonFile } from '../core/json.js'
import {
  buildLaunchPresetFileName,
  normalizePresetName,
  parseTempSettingsStem,
  resolvePresetIndexKey,
} from '../core/name.js'
import {
  resolveCcspStatuslineUnderlyingCommandPath,
  resolveCcspStatuslineUnderlyingPath,
  resolveCcspStatuslineWrapperPath,
  resolveProjectLastUsedPath,
  resolveProjectLaunchPresetIndexPath,
  resolveProjectLaunchPresetPath,
  resolveProjectSessionsPath,
  resolveProjectTempSettingsDir,
  resolveProjectTempSettingsPath,
} from '../core/paths.js'
import {
  createEmptyLaunchPresetIndex,
  createEmptySessionIndex,
  lastUsedLaunchPresetSchema,
  launchPresetIndexSchema,
  parseLaunchPresetSettings,
  parseSettings,
  sessionIndexSchema,
  type LaunchPresetIndex,
  type LaunchPresetMeta,
  type LaunchPresetSettings,
  type SessionBinding,
  type SessionIndex,
  type Settings,
} from '../core/schema.js'
import { ensureProjectCcspStore } from './project-store-service.js'

const MAX_TEMP_SETTINGS_FILES = 50

export type SessionBindingInput = {
  sessionId: string
  globalName: string
  projectPresetName: string
  baseSettings: unknown
  launchSettings: unknown
  toggles: { plugins: unknown[]; skills: unknown[]; mcps: unknown[] }
}

function nowIso(): string {
  return new Date().toISOString()
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function resolveStatuslineScriptPaths(cwd: string, stem: string): string[] {
  return [
    resolveCcspStatuslineWrapperPath(cwd, stem),
    resolveCcspStatuslineUnderlyingPath(cwd, stem),
    resolveCcspStatuslineUnderlyingCommandPath(cwd, stem),
  ]
}

async function cleanupStatuslineScriptsForStem(cwd: string, stem: string): Promise<void> {
  await Promise.all(resolveStatuslineScriptPaths(cwd, stem).map(unlinkIfExists))
}

async function cleanupTempLaunchArtifactsForStem(cwd: string, stem: string): Promise<void> {
  await Promise.all(
    [resolveProjectTempSettingsPath(cwd, `${stem}-settings.json`), ...resolveStatuslineScriptPaths(cwd, stem)].map(
      unlinkIfExists,
    ),
  )
}

export function createLaunchPresetService(cwd: string) {
  const indexPath = resolveProjectLaunchPresetIndexPath(cwd)
  const lastUsedPath = resolveProjectLastUsedPath(cwd)
  const sessionsPath = resolveProjectSessionsPath(cwd)

  async function readIndex(): Promise<LaunchPresetIndex> {
    if (!(await pathExists(indexPath))) return createEmptyLaunchPresetIndex()
    return launchPresetIndexSchema.parse(await readJsonFile(indexPath))
  }

  async function writeIndex(index: LaunchPresetIndex): Promise<void> {
    await ensureProjectCcspStore(cwd)
    await writeJsonFile(indexPath, launchPresetIndexSchema.parse(index))
  }

  async function readSessions(): Promise<SessionIndex> {
    if (!(await pathExists(sessionsPath))) return createEmptySessionIndex()
    return sessionIndexSchema.parse(await readJsonFile(sessionsPath))
  }

  async function writeSessions(sessions: SessionIndex): Promise<void> {
    await ensureProjectCcspStore(cwd)
    await writeJsonFile(sessionsPath, sessionIndexSchema.parse(sessions))
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

  async function pruneOldTempSettings(retainStem?: string): Promise<void> {
    const tempDir = resolveProjectTempSettingsDir(cwd)
    let entries: string[]
    try {
      entries = await fs.readdir(tempDir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }

    const allStems = entries.map(entry => parseTempSettingsStem(entry)).filter((stem): stem is string => Boolean(stem))
    const excess = allStems.length - MAX_TEMP_SETTINGS_FILES
    if (excess <= 0) return

    const stems = allStems.filter(stem => stem !== retainStem)
    const sessions = await readSessions()
    // Oldest-first by recorded use time; legacy files without a session binding
    // sort to the front (empty string) and are pruned first.
    const sorted = [...stems].sort((a, b) => {
      const ta = sessions.sessions[a]?.lastUsedAt ?? ''
      const tb = sessions.sessions[b]?.lastUsedAt ?? ''
      if (ta !== tb) return ta < tb ? -1 : 1
      return a < b ? -1 : 1
    })

    let sessionsChanged = false
    for (const stem of sorted.slice(0, excess)) {
      await cleanupTempLaunchArtifactsForStem(cwd, stem)
      if (sessions.sessions[stem]) {
        delete sessions.sessions[stem]
        sessionsChanged = true
      }
    }

    if (sessionsChanged) await writeSessions(sessions)
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
      const name = normalizePresetName(nameInput, { preserveCase: true })
      const settings = parseLaunchPresetSettings(settingsInput)
      const index = await readIndex()
      if (resolvePresetIndexKey(index.presets, name)) throw new CliError(`Launch preset already exists: ${name}`)

      const timestamp = nowIso()
      const meta: LaunchPresetMeta = {
        name,
        fileName: buildLaunchPresetFileName(name, { preserveCase: true }),
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
      const conflictingKey = resolvePresetIndexKey(index.presets, newName)
      if (conflictingKey && conflictingKey !== name) throw new CliError(`Launch preset already exists: ${newName}`)

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

    async writeTempSettings(settingsInput: unknown, stem: string): Promise<string> {
      const settings = parseSettings(settingsInput) as Settings
      await ensureProjectCcspStore(cwd)
      const filePath = resolveProjectTempSettingsPath(cwd, `${stem}-settings.json`)
      await writeJsonFile(filePath, settings)
      await pruneOldTempSettings(stem)
      return filePath
    },

    async cleanupTempScripts(stem: string): Promise<void> {
      await cleanupStatuslineScriptsForStem(cwd, stem)
    },

    async writeSessionBinding(input: SessionBindingInput): Promise<void> {
      const sessions = await readSessions()
      const now = nowIso()
      const existing = sessions.sessions[input.sessionId]
      sessions.sessions[input.sessionId] = {
        sessionId: input.sessionId,
        globalName: input.globalName,
        projectPresetName: input.projectPresetName,
        baseSettings: input.baseSettings,
        launchSettings: parseLaunchPresetSettings(input.launchSettings),
        toggles: input.toggles,
        createdAt: existing?.createdAt ?? now,
        lastUsedAt: now,
      }
      await writeSessions(sessions)
    },

    async readSessionBinding(sessionId: string): Promise<SessionBinding | undefined> {
      const sessions = await readSessions()
      return sessions.sessions[sessionId]
    },

    async recordSessionExit(sessionId: string): Promise<void> {
      const sessions = await readSessions()
      const existing = sessions.sessions[sessionId]
      if (!existing) return
      sessions.sessions[sessionId] = { ...existing, exitedAt: nowIso() }
      await writeSessions(sessions)
    },

    async deleteSessionBinding(sessionId: string): Promise<void> {
      const sessions = await readSessions()
      if (!sessions.sessions[sessionId]) return
      delete sessions.sessions[sessionId]
      await writeSessions(sessions)
    },

    async findLatestExitedSession(): Promise<SessionBinding | undefined> {
      const sessions = await readSessions()
      const all = Object.values(sessions.sessions)
      const exited = all.filter(session => session.exitedAt)
      const pool = exited.length > 0 ? exited : all
      if (pool.length === 0) return undefined
      return [...pool].sort((a, b) => {
        const ta = a.exitedAt ?? a.lastUsedAt
        const tb = b.exitedAt ?? b.lastUsedAt
        return ta < tb ? 1 : ta > tb ? -1 : 0
      })[0]
    },

    async importExistingLaunchFile(filePath: string, nameInput?: string): Promise<LaunchPresetMeta> {
      const settings = parseLaunchPresetSettings(await readJsonFile(filePath))
      const name = nameInput ?? basename(filePath).replace(/-?launch\.json$/, '')
      return service.createPreset(name, settings)
    },
  }

  return service
}
