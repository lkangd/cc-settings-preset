import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { buildTempSettingsStem } from '../../src/core/name.js'
import { injectCcspStatusLine } from '../../src/services/statusline-injector-service.js'

const projectRoot = '/tmp/ccsp-statusline-project'
const launchDate = new Date('2026-05-22T12:00:00.000Z')
const launchStem = buildTempSettingsStem(launchDate)

async function cleanupProjectTemp(): Promise<void> {
  await fs.rm(join(projectRoot, '.claude', '.ccsp', 'tmp'), { recursive: true, force: true })
}

describe('injectCcspStatusLine', () => {
  afterEach(async () => {
    await cleanupProjectTemp()
  })

  it('writes wrapper-only scripts when no underlying statusLine exists', async () => {
    const settings = await injectCcspStatusLine({
      settings: { permissions: { allow: ['Read(*)'] } },
      meta: {
        globalName: 'work',
        projectPresetName: 'Detected',
        toggles: {
          plugins: [{ name: 'alpha', enabled: true, source: 'user' }],
          skills: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
          mcps: [{ name: 'github', enabled: true, source: 'project', config: {} }],
        },
      },
      context: { homeDir: '/tmp/home', cwd: projectRoot },
      date: launchDate,
    })

    const tmpDir = join(projectRoot, '.claude', '.ccsp', 'tmp')
    const wrapperPath = join(tmpDir, `ccsp-statusline-${launchStem}.sh`)
    const wrapper = await fs.readFile(wrapperPath, 'utf8')

    expect(settings.statusLine).toEqual({
      type: 'command',
      command: wrapperPath,
      refreshInterval: 5,
    })
    expect(wrapper).toContain("printf '\\033[36m%s\\033[0m\\n' 'CCSP: work/Detected | plugins(1/1) | skills(0/1) | MCPs(1/1)'")
    await expect(fs.access(join(tmpDir, `ccsp-statusline-underlying-${launchStem}.sh`))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('chains underlying statusLine output before ccsp lines', async () => {
    const settings = await injectCcspStatusLine({
      settings: {},
      resolved: {
        scope: 'user',
        config: { type: 'command', command: "echo 'underlying'" },
      },
      meta: {
        globalName: 'work',
        projectPresetName: 'web',
        toggles: {
          plugins: [],
          skills: [],
          mcps: [],
        },
      },
      context: { homeDir: '/tmp/home', cwd: projectRoot },
      date: launchDate,
    })

    const tmpDir = join(projectRoot, '.claude', '.ccsp', 'tmp')
    const wrapperPath = join(tmpDir, `ccsp-statusline-${launchStem}.sh`)
    const underlyingPath = join(tmpDir, `ccsp-statusline-underlying-${launchStem}.sh`)
    const commandPath = join(tmpDir, `ccsp-statusline-underlying-${launchStem}.cmd`)

    expect(settings.statusLine.command).toBe(wrapperPath)
    await expect(fs.readFile(commandPath, 'utf8')).resolves.toBe("echo 'underlying'")
    await expect(fs.readFile(underlyingPath, 'utf8')).resolves.toContain(commandPath)
    await expect(fs.readFile(wrapperPath, 'utf8')).resolves.toContain(underlyingPath)
  })
})
