import { promises as fs } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { CliError } from './errors.js'

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true })
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  let content: string
  try {
    content = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError(`File not found: ${filePath}`)
    }
    throw error
  }

  try {
    return JSON.parse(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new CliError(`Invalid JSON in ${filePath}: ${message}`)
  }
}

async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  await ensureParentDir(filePath)
  const tempFilePath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  await fs.writeFile(tempFilePath, content, 'utf8')
  await fs.rename(tempFilePath, filePath)
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}
