import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * Encode a project cwd the way Claude Code names its per-project session
 * directory under `~/.claude/projects/`. Both `/` and `.` segments collapse to
 * `-`, e.g. `/Users/x/.foo` -> `-Users-x--foo`.
 */
export function encodeClaudeProjectDirName(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}

export function resolveClaudeProjectSessionsDir(homeDir: string, cwd: string): string {
  return join(homeDir, '.claude', 'projects', encodeClaudeProjectDirName(cwd))
}

type JsonlEntry = { name: string; birthtimeMs: number }

export type ClaudeSessionService = {
  snapshot(): Promise<Set<string>>
  findNewSessionId(snapshot: Set<string>): Promise<string | undefined>
  hasSession(sessionId: string): Promise<boolean>
}

export function createClaudeSessionService(homeDir: string, cwd: string): ClaudeSessionService {
  const dir = resolveClaudeProjectSessionsDir(homeDir, cwd)

  async function listJsonlEntries(): Promise<JsonlEntry[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const out: JsonlEntry[] = []
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue
      try {
        const stat = await fs.stat(join(dir, entry))
        if (!stat.isFile()) continue
        out.push({ name: entry, birthtimeMs: stat.birthtimeMs })
      } catch {
        // entry vanished between readdir and stat; ignore
      }
    }
    return out
  }

  return {
    async snapshot(): Promise<Set<string>> {
      return new Set((await listJsonlEntries()).map(entry => entry.name))
    },
    /**
     * Find the session id Claude created during this launch by diffing against
     * a pre-spawn snapshot. Picks the new jsonl with the earliest birthtime so
     * concurrent ccsp launches in the same cwd don't steal each other's ids.
     */
    async findNewSessionId(snapshot: Set<string>): Promise<string | undefined> {
      const current = await listJsonlEntries()
      const fresh = current.filter(entry => !snapshot.has(entry.name))
      if (fresh.length === 0) return undefined
      fresh.sort((a, b) => a.birthtimeMs - b.birthtimeMs)
      const first = fresh[0]!
      return first.name.replace(/\.jsonl$/, '')
    },
    async hasSession(sessionId: string): Promise<boolean> {
      try {
        const stat = await fs.stat(join(dir, `${sessionId}.jsonl`))
        return stat.isFile()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
        throw error
      }
    },
  }
}
