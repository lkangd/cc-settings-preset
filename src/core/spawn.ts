import spawn from 'cross-spawn'

import { CliError } from './errors.js'

export async function spawnClaude(settingsPath: string, claudeArgs: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['--settings', settingsPath, ...claudeArgs], {
      stdio: 'inherit',
    })

    child.once('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new CliError('Claude Code executable not found. Install Claude Code or check PATH.'))
        return
      }
      reject(error)
    })

    child.once('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (signal) {
        reject(new CliError(`Command terminated by signal ${signal}`))
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
