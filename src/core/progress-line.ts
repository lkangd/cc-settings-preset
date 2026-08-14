import { truncateToDisplayWidth } from './display-width.js'

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_INTERVAL_MS = 120
const CLEAR_LINE = '\r\x1b[2K'
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g

// Step text is built from names that come out of a settings file, so it can hold anything.
// This module's entire contract is "one line the next frame can erase": a stray newline
// would put earlier frames out of the cursor's reach, and an ESC would hand the terminal a
// control sequence of someone else's choosing.
function toSingleLine(text: string): string {
  return text.replace(CONTROL_CHARACTERS, ' ')
}

type ProgressStream = Pick<NodeJS.WriteStream, 'write'> & {
  isTTY?: boolean
  columns?: number
}

export type ProgressLine = {
  update: (text: string) => void
  stop: () => void
}

// A single line that redraws in place: a spinner plus how long the current step has
// been running, so a step that reports no progress of its own still looks alive.
// The cursor is deliberately left visible — a SIGINT during the step kills us without
// running `stop()`, and a hidden cursor would outlive the process in the user's shell.
export function createProgressLine(
  stream: ProgressStream = process.stderr,
  options: { intervalMs?: number; now?: () => number } = {},
): ProgressLine {
  const intervalMs = options.intervalMs ?? FRAME_INTERVAL_MS
  const now = options.now ?? Date.now

  // Reporting is decoration, and a decoration must not be able to take down the work it
  // decorates: a stream that has gone away (a closed pipe, an EPIPE) would otherwise abort
  // the caller mid-step, or — from inside the redraw timer, where there is no caller to
  // catch it — the whole process. There is nowhere to report the failure to: the surface we
  // would report it on is the one that just failed.
  const write = (chunk: string) => {
    try {
      stream.write(chunk)
    } catch {
      // Ignored on purpose, see above.
    }
  }

  // A pipe or a log file has no cursor to rewind, so an animated line would pile up
  // one copy per frame there: print each step once and leave it in the transcript.
  if (!stream.isTTY) {
    return {
      update: text => {
        write(`${toSingleLine(text)}\n`)
      },
      stop: () => {},
    }
  }

  let current: string | undefined
  let startedAt = now()
  let frame = 0
  let timer: NodeJS.Timeout | undefined

  const render = () => {
    if (current === undefined) return
    const elapsedSeconds = Math.floor((now() - startedAt) / 1000)
    const line = `${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]} ${current}${elapsedSeconds > 0 ? ` ${elapsedSeconds}s` : ''}`
    // Wrapping would leave the overflowed rows behind on the next redraw, since
    // `CLEAR_LINE` only reaches the row the cursor sits on.
    write(CLEAR_LINE + truncateToDisplayWidth(line, Math.max((stream.columns ?? 80) - 1, 0)))
  }

  return {
    update: text => {
      current = toSingleLine(text)
      startedAt = now()
      frame = 0
      render()
      if (timer) return
      timer = setInterval(() => {
        frame += 1
        render()
      }, intervalMs)
      // The line is decoration: it must never be what keeps the process alive.
      timer.unref?.()
    },
    stop: () => {
      if (timer) {
        clearInterval(timer)
        timer = undefined
      }
      if (current === undefined) return
      current = undefined
      write(CLEAR_LINE)
    },
  }
}
