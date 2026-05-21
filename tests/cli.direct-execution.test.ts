import { symlink, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { isCliDirectExecution } from '../src/cli.js'

describe('isCliDirectExecution', () => {
  it('returns true when argv points to the module through a symlink', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-cli-'))
    const scriptPath = join(root, 'cli.js')
    const symlinkPath = join(root, 'ccsp')

    await writeFile(scriptPath, 'export {}\n')
    await symlink(scriptPath, symlinkPath)

    expect(
      isCliDirectExecution(['node', symlinkPath], pathToFileURL(scriptPath))
    ).toBe(true)
  })

  it('returns false when argv points to a different script', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-cli-'))
    const scriptPath = join(root, 'cli.js')
    const otherPath = join(root, 'other.js')

    await writeFile(scriptPath, 'export {}\n')
    await writeFile(otherPath, 'export {}\n')

    expect(
      isCliDirectExecution(['node', otherPath], pathToFileURL(scriptPath))
    ).toBe(false)
  })
})
