import { promises as fs } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  createClaudeSessionService,
  encodeClaudeProjectDirName,
  resolveClaudeProjectSessionsDir,
} from '../../src/services/claude-session-service.js'

async function makeProjectDir(homeDir: string, cwd: string): Promise<string> {
  const dir = resolveClaudeProjectSessionsDir(homeDir, cwd)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

describe('claude session service', () => {
  it('encodes the cwd to match Claude\'s projects directory layout', () => {
    expect(encodeClaudeProjectDirName('/Users/me/repo')).toBe('-Users-me-repo')
    expect(encodeClaudeProjectDirName('/Users/me/.claude')).toBe('-Users-me--claude')
  })

  it('returns an empty snapshot when Claude\'s project dir does not exist', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'ccsp-home-'))
    const service = createClaudeSessionService(homeDir, '/missing/project')
    expect(await service.snapshot()).toEqual(new Set())
    expect(await service.findNewSessionId(new Set())).toBeUndefined()
  })

  it('discovers a freshly created session jsonl by diffing against the snapshot', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'ccsp-home-'))
    const cwd = '/Users/me/repo'
    const dir = await makeProjectDir(homeDir, cwd)

    await writeFile(join(dir, 'existing-aaaa-bbbb-cccc-dddddddddddd.jsonl'), '{}\n')

    const service = createClaudeSessionService(homeDir, cwd)
    const snapshot = await service.snapshot()
    expect(snapshot.has('existing-aaaa-bbbb-cccc-dddddddddddd.jsonl')).toBe(true)

    await writeFile(join(dir, 'fresh11-1111-4111-8111-111111111111.jsonl'), '{}\n')

    expect(await service.findNewSessionId(snapshot)).toBe('fresh11-1111-4111-8111-111111111111')
  })

  it('picks the earliest birthtime when multiple new files appear (concurrent launches)', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'ccsp-home-'))
    const cwd = '/Users/me/repo'
    const dir = await makeProjectDir(homeDir, cwd)

    const service = createClaudeSessionService(homeDir, cwd)
    const snapshot = await service.snapshot()

    // Write the "ours" file first so its birthtime is earliest.
    await writeFile(join(dir, 'first11-1111-4111-8111-111111111111.jsonl'), '{}\n')
    await new Promise(resolve => setTimeout(resolve, 50))
    await writeFile(join(dir, 'second2-2222-4222-8222-222222222222.jsonl'), '{}\n')

    expect(await service.findNewSessionId(snapshot)).toBe('first11-1111-4111-8111-111111111111')
  })
})
