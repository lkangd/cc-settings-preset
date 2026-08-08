import { promises as fs } from 'node:fs'
import { hostname } from 'node:os'
import { basename } from 'node:path'
import { CliError } from '../core/errors.js'
import { asRecord } from '../core/is-plain-object.js'
import { readJsonFile, readJsonFileOrDefault, writeJsonFile } from '../core/json.js'
import {
  buildLaunchPresetFileName,
  normalizePresetName,
  parseTempSettingsStem,
  resolvePresetIndexKey,
} from '../core/name.js'
import {
  resolveCcspLaunchLockPath,
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
import { currentBootOffsetMs, isPidAlive, ownProcessBootOffsetMs, readProcessBootOffsets } from '../core/process.js'
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
  presetLabel?: string
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

// Every path gets its attempt even when one of them fails. These are rollback and
// shutdown paths, and `Promise.all` abandons its siblings the moment one rejects —
// which is exactly how a lock gets stranded: the pruner only enumerates stems that
// still own a settings file, so a lock left behind by a half-written launch would
// never be reclaimed by anyone.
async function unlinkAll(filePaths: string[]): Promise<void> {
  const results = await Promise.allSettled(filePaths.map(unlinkIfExists))
  const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
  if (failure) throw failure.reason
}

// Everything a launch owns for as long as claude is alive: the statusline scripts
// claude re-executes on every refresh, plus the lock that marks the stem in use.
function resolveRuntimeArtifactPaths(cwd: string, stem: string): string[] {
  return [
    resolveCcspStatuslineWrapperPath(cwd, stem),
    resolveCcspStatuslineUnderlyingPath(cwd, stem),
    resolveCcspStatuslineUnderlyingCommandPath(cwd, stem),
    resolveCcspLaunchLockPath(cwd, stem),
  ]
}

// Runs when the launch is over: the statusline scripts are only meaningful while
// claude is alive, and dropping the lock re-opens the stem for pruning.
async function cleanupRuntimeArtifactsForStem(cwd: string, stem: string): Promise<void> {
  await unlinkAll(resolveRuntimeArtifactPaths(cwd, stem))
}

async function cleanupTempLaunchArtifactsForStem(cwd: string, stem: string): Promise<void> {
  await unlinkAll([
    resolveProjectTempSettingsPath(cwd, `${stem}-settings.json`),
    ...resolveRuntimeArtifactPaths(cwd, stem),
  ])
}

// One process holding a stem. `bootOffsetMs` — when the process started, measured
// from boot — pins the pid to a specific process: pid numbers get recycled, and a
// bare liveness probe cannot tell the launch that wrote the lock from whatever
// unrelated process inherited its number afterwards.
type LaunchOwner = { pid: number; bootOffsetMs?: number }

// Identity of whoever holds a stem. `owners` carries both the ccsp process and,
// once it exists, the claude process it spawned: ccsp can be SIGKILLed without ever
// running its cleanup, and claude then keeps running (reparented) still depending
// on these files, so the ccsp pid alone is not proof that the stem is free.
type LaunchLock = {
  host: string
  owners: LaunchOwner[]
}

// The flat `pids` list is written purely for ccsp builds that predate `owners`:
// they read nothing else, so a lock without it looks unowned to them — i.e. free to
// delete out from under a live session.
type StoredLaunchLock = LaunchLock & { pids: number[] }

async function writeLaunchLock(cwd: string, stem: string, owners: LaunchOwner[]): Promise<void> {
  await writeJsonFile(resolveCcspLaunchLockPath(cwd, stem), {
    host: hostname(),
    pids: owners.map(owner => owner.pid),
    owners,
  } satisfies StoredLaunchLock)
}

// The union of both representations, never one to the exclusion of the other: a
// pid named only by the legacy mirror is still a claim on the stem, and dropping it
// because an `owners` array happened to be present (empty, truncated, or written by
// something else) would reclaim a stem out from under a live session. Identity from
// `owners` upgrades the matching pid where the two overlap.
function parseLaunchOwners(parsed: Record<string, unknown>): LaunchOwner[] {
  const owners = new Map<number, LaunchOwner>()

  if (Array.isArray(parsed.pids)) {
    for (const pid of parsed.pids) {
      if (Number.isInteger(pid) && pid > 0) owners.set(pid, { pid })
    }
  }

  if (Array.isArray(parsed.owners)) {
    for (const entry of parsed.owners) {
      const { pid, bootOffsetMs } = asRecord(entry)
      if (!Number.isInteger(pid) || (pid as number) <= 0) continue
      owners.set(pid as number, {
        pid: pid as number,
        ...(typeof bootOffsetMs === 'number' && Number.isFinite(bootOffsetMs) ? { bootOffsetMs } : {}),
      })
    }
  }

  return [...owners.values()]
}

// Total slop between the offset we record and the one we later observe. Both are
// read off the same boot clock, so the budget is only measurement error: `os.uptime()`
// is whole seconds on macOS (once when recording, once when observing) and `ps`
// truncates elapsed time to whole seconds — about 3s all told. Everything above that
// is a different process, so the window in which a recycled pid can still pass for
// its predecessor is this value, not the minute an eyeballed constant would give it.
const PID_IDENTITY_TOLERANCE_MS = 10_000

function isOwnerAlive(owner: LaunchOwner, bootOffsets: Map<number, number>): boolean {
  if (!isPidAlive(owner.pid)) return false
  if (owner.bootOffsetMs === undefined) return true

  const observedBootOffsetMs = bootOffsets.get(owner.pid)
  // No reading for this pid — `ps` is missing, refused, printed something we could
  // not parse, or the owner was claimed after the batch was taken. Uncertainty keeps
  // the stem: retaining one too long leaks a few files, releasing one too early
  // deletes a live session's settings.
  if (observedBootOffsetMs === undefined) return true

  // A recycled pid necessarily started after we wrote the lock, so anything newer
  // than the recorded start is a different process wearing the same number.
  return observedBootOffsetMs <= owner.bootOffsetMs + PID_IDENTITY_TOLERANCE_MS
}

// An unreadable or malformed lock yields a lock with no recognizable owner rather
// than `undefined`: "someone claimed this, we cannot tell who" must not be
// mistaken for "nobody claimed this".
async function readLaunchLock(cwd: string, stem: string): Promise<LaunchLock | undefined> {
  let raw: string
  try {
    raw = await fs.readFile(resolveCcspLaunchLockPath(cwd, stem), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }

  try {
    const parsed = asRecord(JSON.parse(raw))
    return {
      host: typeof parsed.host === 'string' ? parsed.host : '',
      owners: parseLaunchOwners(parsed),
    }
  } catch {
    return { host: '', owners: [] }
  }
}

type PrunableStem = { stem: string; mtimeMs: number }

// A stem is prunable only once nothing can still be using it. Claude holds
// `<stem>-settings.json` by path and re-runs `ccsp-statusline-<stem>.sh` on every
// refresh, so deleting either out from under a live session makes that session's
// statusline vanish mid-session.
async function resolvePrunableStem(
  cwd: string,
  stem: string,
  lock: LaunchLock | undefined,
  bootOffsets: Map<number, number>,
): Promise<PrunableStem | undefined> {
  if (lock) {
    // A lock written elsewhere — another machine sharing the directory, or a
    // container, which gets its own hostname and its own pid numbering — says
    // nothing about our process table, so probing its pids locally would report
    // "dead" for a session that is very much alive. Leave those stems alone: every
    // host reclaims the locks it wrote itself.
    if (lock.host !== hostname()) return undefined
    if (lock.owners.some(owner => isOwnerAlive(owner, bootOffsets))) return undefined

    // The snapshot above predates the batched `ps`, and a launch claims its claude
    // child mid-flight: without re-reading, a lock that gained a live owner while we
    // were probing gets deleted along with the session it was protecting. An owner
    // that arrived too late for the batch has no reading, which `isOwnerAlive()`
    // already resolves to alive.
    const current = await readLaunchLock(cwd, stem)
    if (current && (current.host !== hostname() || current.owners.some(owner => isOwnerAlive(owner, bootOffsets)))) {
      return undefined
    }

    // Stale lock: ccsp was killed before it could release the stem. Drop it now so a
    // pre-identity lock's pids cannot later be reused by unrelated processes and pin
    // the stem for good.
    await unlinkIfExists(resolveCcspLaunchLockPath(cwd, stem))
  }

  return { stem, mtimeMs: await readTempSettingsMtime(cwd, stem) }
}

async function readTempSettingsMtime(cwd: string, stem: string): Promise<number> {
  try {
    return (await fs.stat(resolveProjectTempSettingsPath(cwd, `${stem}-settings.json`))).mtimeMs
  } catch {
    return 0
  }
}

export function createLaunchPresetService(cwd: string) {
  const indexPath = resolveProjectLaunchPresetIndexPath(cwd)
  const lastUsedPath = resolveProjectLastUsedPath(cwd)
  const sessionsPath = resolveProjectSessionsPath(cwd)
  let indexPromise: Promise<LaunchPresetIndex> | undefined
  let sessionsPromise: Promise<SessionIndex> | undefined

  function invalidateIndex(): void {
    indexPromise = undefined
  }

  function invalidateSessions(): void {
    sessionsPromise = undefined
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
    await ensureProjectCcspStore(cwd)
    await writeJsonFile(indexPath, launchPresetIndexSchema.parse(index))
    invalidateIndex()
  }

  async function readSessionsUncached(): Promise<SessionIndex> {
    return sessionIndexSchema.parse(await readJsonFileOrDefault(sessionsPath, createEmptySessionIndex()))
  }

  async function readSessions(): Promise<SessionIndex> {
    if (!sessionsPromise) {
      sessionsPromise = readSessionsUncached().catch(error => {
        sessionsPromise = undefined
        throw error
      })
    }

    return sessionsPromise
  }

  async function writeSessions(sessions: SessionIndex): Promise<void> {
    await ensureProjectCcspStore(cwd)
    await writeJsonFile(sessionsPath, sessionIndexSchema.parse(sessions))
    invalidateSessions()
  }

  function getPresetPath(meta: LaunchPresetMeta): string {
    return resolveProjectLaunchPresetPath(cwd, meta.fileName)
  }

  async function readLastUsed(): Promise<string | undefined> {
    const raw = await readJsonFileOrDefault(lastUsedPath, undefined)
    if (raw === undefined) return undefined
    const parsed = lastUsedLaunchPresetSchema.parse(raw)
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

    // Only stems that nothing still holds may be pruned. Concurrent sessions in
    // the same project all prune the same directory, so without this guard a fresh
    // launch happily deletes an already-running session's settings file and
    // statusline scripts.
    const locked = await Promise.all(allStems
      .filter(stem => stem !== retainStem)
      .map(async stem => ({ stem, lock: await readLaunchLock(cwd, stem) })))

    // One `ps` for the whole directory rather than one per stem: spawning a probe
    // per stem would cost more than the prune it guards. Only owners carrying an
    // identity are worth asking about — for the rest there is nothing to compare a
    // reading against. Liveness itself is left to `isOwnerAlive()`: pre-filtering on
    // it here would probe every pid twice, and a dead pid simply goes unanswered.
    const bootOffsets = await readProcessBootOffsets(locked.flatMap(({ lock }) => (
      lock?.host === hostname()
        ? lock.owners.filter(owner => owner.bootOffsetMs !== undefined).map(owner => owner.pid)
        : []
    )))

    const prunable = (await Promise.all(locked
      .map(({ stem, lock }) => resolvePrunableStem(cwd, stem, lock, bootOffsets))))
      .filter((entry): entry is PrunableStem => entry !== undefined)

    // Oldest-first by the settings file's own mtime, which is written once per
    // launch. Unreadable entries sort to the front and are pruned first; the stem
    // tiebreak keeps the order deterministic when two launches share a timestamp.
    const sorted = prunable.sort((a, b) => {
      if (a.mtimeMs !== b.mtimeMs) return a.mtimeMs - b.mtimeMs
      return a.stem < b.stem ? -1 : 1
    })

    for (const { stem } of sorted.slice(0, excess)) {
      await cleanupTempLaunchArtifactsForStem(cwd, stem)
    }
  }

  const service = {
    async listPresets(): Promise<LaunchPresetMeta[]> {
      const index = await readIndex()
      return Object.values(index.presets).sort((a, b) => a.name.localeCompare(b.name))
    },

    async listPresetsWithSettings(): Promise<Array<{ meta: LaunchPresetMeta; settings: LaunchPresetSettings }>> {
      const presets = await service.listPresets()
      return Promise.all(presets.map(async meta => ({
        meta,
        settings: parseLaunchPresetSettings(await readJsonFile(getPresetPath(meta))),
      })))
    },

    async readPresetSettings(nameInput: string): Promise<LaunchPresetSettings> {
      const index = await readIndex()
      const name = resolvePresetIndexKey(index.presets, nameInput)
      if (!name) throw new CliError(`Launch preset not found: ${nameInput}`, 1, 'launch_preset_not_found')
      const meta = index.presets[name]
      if (!meta) throw new CliError(`Launch preset not found: ${nameInput}`)
      return parseLaunchPresetSettings(await readJsonFile(getPresetPath(meta)))
    },

    async createPreset(nameInput: string, settingsInput: unknown): Promise<LaunchPresetMeta> {
      const name = normalizePresetName(nameInput, { preserveCase: true })
      const settings = parseLaunchPresetSettings(settingsInput)
      const index = await readIndex()
      if (resolvePresetIndexKey(index.presets, name)) throw new CliError(`Launch preset already exists: ${name}`, 1, 'launch_preset_already_exists')

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
      if (!name) throw new CliError(`Launch preset not found: ${nameInput}`, 1, 'launch_preset_not_found')
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
      if (!name) throw new CliError(`Launch preset not found: ${nameInput}`, 1, 'launch_preset_not_found')
      const existing = index.presets[name]
      if (!existing) throw new CliError(`Launch preset not found: ${nameInput}`)
      if (newName === name) {
        return { ...existing, updatedAt: nowIso() }
      }
      const conflictingKey = resolvePresetIndexKey(index.presets, newName)
      if (conflictingKey && conflictingKey !== name) throw new CliError(`Launch preset already exists: ${newName}`, 1, 'launch_preset_already_exists')

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
      // Claim the stem before the settings file exists: a concurrent launch that
      // lists the directory in between would otherwise see an unlocked stem and
      // treat this still-starting session as prunable.
      await writeLaunchLock(cwd, stem, [{ pid: process.pid, bootOffsetMs: ownProcessBootOffsetMs() }])
      const filePath = resolveProjectTempSettingsPath(cwd, `${stem}-settings.json`)
      try {
        await writeJsonFile(filePath, settings)
        await pruneOldTempSettings(stem)
      } catch (error) {
        // The pruner only ever enumerates stems that own a settings file, so a
        // lock stranded by a half-written launch would never be reclaimed. Roll
        // the stem back, keeping the original failure as the thrown error.
        await cleanupTempLaunchArtifactsForStem(cwd, stem).catch(() => undefined)
        throw error
      }
      return filePath
    },

    // Best-effort hardening for the one death ccsp cannot clean up after: if it is
    // SIGKILLed, claude survives as an orphan that still depends on the stem, and
    // only claude's own pid can still prove that. On failure the lock keeps naming
    // just the ccsp process, i.e. exactly the protection we had before.
    async recordLaunchOwnerPid(stem: string, pid: number): Promise<void> {
      // Sampled before the first await, not after: we are called straight out of
      // spawn, so right now the child's age is the spawn latency alone, while a lock
      // read in between would fold its own latency into the child's identity.
      const bootOffsetMs = currentBootOffsetMs()
      try {
        const lock = await readLaunchLock(cwd, stem)
        const owners = lock?.owners ?? [{ pid: process.pid, bootOffsetMs: ownProcessBootOffsetMs() }]
        await writeLaunchLock(cwd, stem, [...owners.filter(owner => owner.pid !== pid), { pid, bootOffsetMs }])
      } catch {
        // Ignore.
      }
    },

    async cleanupTempScripts(stem: string): Promise<void> {
      await cleanupRuntimeArtifactsForStem(cwd, stem)
    },

    async writeSessionBinding(input: SessionBindingInput): Promise<void> {
      const sessions = await readSessions()
      const now = nowIso()
      const existing = sessions.sessions[input.sessionId]
      sessions.sessions[input.sessionId] = {
        sessionId: input.sessionId,
        globalName: input.globalName,
        projectPresetName: input.projectPresetName,
        ...(input.presetLabel ? { presetLabel: input.presetLabel } : {}),
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
