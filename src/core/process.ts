import { execFile } from 'node:child_process'
import { uptime as osUptime } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the pid exists but belongs to another user — still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

// `ps -o etime=` renders elapsed time as `[[DD-]HH:]MM:SS` on both macOS and Linux.
// `etimes` (plain seconds) would be easier to read but is a procps extension macOS
// does not ship, and `lstart` spells out localized month names.
const ELAPSED_TIME_PATTERN = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/

function parseElapsedSeconds(value: string): number | undefined {
  const match = ELAPSED_TIME_PATTERN.exec(value)
  if (!match) return undefined
  const [, days = '0', hours = '0', minutes, seconds] = match
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes)) * 60 + Number(seconds)
}

// Above Linux's largest configurable `pid_max`, and far above the macOS ceiling.
// A pid this big can only come from a corrupt lock file, and `ps` rejects the
// *entire* query when one argument is out of range ("process id too large"), so
// letting one through would blank the readings for every healthy pid beside it.
const MAX_QUERYABLE_PID = 2 ** 22

// How long a process has been alive is not usable as an identity on its own — it
// changes every second. What is stable is *when it started*, and we express that as
// milliseconds after boot rather than as a wall-clock instant on purpose: an epoch
// timestamp is reconstructed as `Date.now() - elapsed`, so an NTP or manual clock
// correction lands entirely in the result and makes a still-running process look
// like a stranger that took over its pid. Both sides of the comparison are anchored
// to the boot clock instead, which no clock adjustment moves.
export async function readProcessBootOffsets(pids: number[]): Promise<Map<number, number>> {
  const bootOffsets = new Map<number, number>()
  const targets = [...new Set(pids)].filter(pid => Number.isInteger(pid) && pid > 0 && pid <= MAX_QUERYABLE_PID)
  // Windows has no `ps` and no portable substitute, so every pid stays unknown there.
  if (targets.length === 0 || process.platform === 'win32') return bootOffsets

  let stdout: string
  try {
    // `ps` exits non-zero as soon as *any* requested pid is gone, while still
    // printing the rows for the ones that remain — so a rejection can carry output
    // worth reading.
    stdout = (await execFileAsync('ps', ['-o', 'pid=,etime=', '-p', targets.join(',')])).stdout
  } catch (error) {
    stdout = String((error as { stdout?: unknown }).stdout ?? '')
  }

  // One reading for the whole batch: `ps` reports elapsed time, so every row is
  // resolved against the same point on the boot clock the reading was taken at.
  const uptimeMs = osUptime() * 1000
  for (const line of stdout.split('\n')) {
    const [pid, elapsed] = line.trim().split(/\s+/)
    if (elapsed === undefined) continue
    const elapsedSeconds = parseElapsedSeconds(elapsed)
    if (elapsedSeconds === undefined) continue
    const parsedPid = Number(pid)
    if (!Number.isInteger(parsedPid) || parsedPid <= 0) continue
    bootOffsets.set(parsedPid, Math.round(uptimeMs - elapsedSeconds * 1000))
  }

  return bootOffsets
}

// This process's own start, on the same boot clock `readProcessBootOffsets()` reads,
// derived from the runtime's uptime rather than sampled when we happen to need it:
// callers stamp locks well into the run.
export function ownProcessBootOffsetMs(): number {
  return Math.round((osUptime() - process.uptime()) * 1000)
}

// Start offset for a process that is being created right now — the caller has just
// spawned it, so "now" is its birth to within the spawn latency.
export function currentBootOffsetMs(): number {
  return Math.round(osUptime() * 1000)
}
