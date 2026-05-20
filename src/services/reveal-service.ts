import { spawn } from 'node:child_process'

export function revealInFinder(filePath: string, spawnProcess: typeof spawn = spawn): void {
  if (!filePath) return
  spawnProcess('open', ['-R', filePath], { stdio: 'ignore' })
}
