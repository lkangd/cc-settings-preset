import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { readManagedSettings } from '../../src/services/managed-settings-service.js'

const managedDir = '/Library/Application Support/ClaudeCode'
const mainPath = join(managedDir, 'managed-settings.json')
const dropInDir = join(managedDir, 'managed-settings.d')

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function cleanupManagedFixtures(): Promise<void> {
  await removeIfExists(join(dropInDir, '20-override.json'))
  await removeIfExists(join(dropInDir, '10-base.json'))
  await removeIfExists(mainPath)
  try {
    await fs.rmdir(dropInDir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

describe('readManagedSettings', () => {
  afterEach(async () => {
    await cleanupManagedFixtures()
  })

  it('merges managed-settings.d fragments over the main file', async () => {
    await fs.mkdir(dropInDir, { recursive: true })
    await fs.writeFile(mainPath, JSON.stringify({ statusLine: { type: 'command', command: 'main' } }), 'utf8')
    await fs.writeFile(
      join(dropInDir, '10-base.json'),
      JSON.stringify({ permissions: { allow: ['Read(*)'] } }),
      'utf8',
    )
    await fs.writeFile(
      join(dropInDir, '20-override.json'),
      JSON.stringify({ statusLine: { type: 'command', command: 'override' } }),
      'utf8',
    )

    await expect(readManagedSettings()).resolves.toEqual({
      statusLine: { type: 'command', command: 'override' },
      permissions: { allow: ['Read(*)'] },
    })
  })
})
