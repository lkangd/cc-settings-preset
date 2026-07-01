import { execFile as execFileCallback } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

export type TtyStep =
  | { type: 'write'; data: string }
  | { type: 'read'; ms: number }
  | { type: 'waitFor'; expected: string; timeoutMs: number }

export type RunInTtyOptions = {
  command: string[]
  cwd: string
  env?: Record<string, string>
  steps: TtyStep[]
}

export type TtyRunResult = {
  rawOutput: string
  normalizedOutput: string
  frames: string[]
  finalFrame: string
}

const helperDir = dirname(fileURLToPath(import.meta.url))
const runnerPath = join(helperDir, 'tty_runner.py')

export async function runInTty(options: RunInTtyOptions): Promise<TtyRunResult> {
  const request = JSON.stringify(options)
  const { stdout, stderr } = await execFile('python3', [runnerPath, request])

  try {
    return JSON.parse(stdout) as TtyRunResult
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`tty_runner.py returned invalid JSON: ${message}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`)
  }
}
