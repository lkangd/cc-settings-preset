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

    child.once('close', code => {
      resolve(code ?? 1)
    })
  })
}
