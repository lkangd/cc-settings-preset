import { constants } from 'node:os'

import spawn from 'cross-spawn'

import { CliError } from './errors.js'

// Signals whose default disposition is to terminate the process. We must handle
// these explicitly: otherwise Node tears ccsp down immediately (without firing
// the 'exit' event) and the inherited `claude` child is left orphaned to pid 1.
//
// tty-generated signals (SIGINT/SIGQUIT via Ctrl+C / Ctrl+\) are intentionally
// excluded: the tty delivers them to the whole foreground process group, so
// claude already receives them directly — forwarding would double-deliver and
// break claude's own interrupt handling. SIGHUP (terminal close) and SIGTERM
// (external kill) are not tty-generated, so forwarding them is unambiguous.
const TERMINATION_SIGNALS: NodeJS.Signals[] = ['SIGHUP', 'SIGTERM']

// Grace period between forwarding the terminating signal and force-killing a
// child that refuses to exit (e.g. claude ignores SIGHUP while in raw mode).
const FORCE_KILL_DELAY_MS = 5000

export async function spawnClaude(settingsPath: string, claudeArgs: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['--settings', settingsPath, ...claudeArgs], {
      stdio: 'inherit',
    })

    let settled = false
    let forceKillTimer: NodeJS.Timeout | undefined

    // Liveness must be derived from exit/signal codes, not `child.killed`:
    // `killed` only records that kill() was *called* (true the moment we forward
    // SIGHUP), so using it here would make the escalation timer skip the SIGKILL
    // it exists to deliver. Both codes stay null until the child actually exits.
    const childAlive = () => child.exitCode === null && child.signalCode === null

    // Forward a terminating signal to the child so it can shut down gracefully,
    // then escalate to SIGKILL if it ignores the signal. This binds claude's
    // lifetime to ccsp's, so closing the terminal can't leave an orphan behind.
    const forwardSignal = (signal: NodeJS.Signals) => {
      if (!childAlive()) return
      try {
        child.kill(signal)
      } catch {
        // Child is already gone; nothing to forward.
      }
      if (!forceKillTimer) {
        forceKillTimer = setTimeout(() => {
          if (childAlive()) {
            try {
              child.kill('SIGKILL')
            } catch {
              // Already exited between the check and the kill.
            }
          }
        }, FORCE_KILL_DELAY_MS)
        // Don't let the escalation timer keep ccsp alive on its own.
        forceKillTimer.unref?.()
      }
    }

    // Last-resort guarantee: if ccsp exits through any path while the child is
    // still alive, take the child down with it. The 'exit' handler runs
    // synchronously, so only a synchronous kill is reliable here.
    const onProcessExit = () => {
      if (childAlive()) {
        try {
          child.kill('SIGKILL')
        } catch {
          // Already exited.
        }
      }
    }

    for (const signal of TERMINATION_SIGNALS) {
      process.on(signal, forwardSignal)
    }
    process.on('exit', onProcessExit)

    const cleanup = () => {
      if (forceKillTimer) {
        clearTimeout(forceKillTimer)
        forceKillTimer = undefined
      }
      for (const signal of TERMINATION_SIGNALS) {
        process.removeListener(signal, forwardSignal)
      }
      process.removeListener('exit', onProcessExit)
    }

    child.once('error', error => {
      if (settled) return
      settled = true
      cleanup()
      const err = error as NodeJS.ErrnoException
      if (err.code === 'ENOENT') {
        reject(new CliError('Claude Code executable not found. Install Claude Code or check PATH.'))
        return
      }
      // Wrap every other spawn failure (EACCES, EMFILE, …) in a CliError so the
      // caller sets a non-zero process.exitCode and prints a clean message,
      // instead of surfacing a raw unhandled rejection.
      reject(new CliError(`Failed to launch Claude Code: ${err.message}`))
    })

    child.once('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return
      settled = true
      cleanup()

      if (signal) {
        // Signal death is the expected outcome of our own forwarding (terminal
        // close / external kill), not an error. Report it with the conventional
        // 128+signum exit status so callers can both detect it and stay quiet.
        const signum = constants.signals[signal] ?? 0
        resolve(128 + signum)
        return
      }

      if (exitCode === null) {
        reject(new CliError('Command terminated without an exit code'))
        return
      }

      if (exitCode !== 0) {
        reject(new CliError(`Command exited with code ${exitCode}`, exitCode))
        return
      }

      resolve(0)
    })
  })
}
