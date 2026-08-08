import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import {
  resolveCcspLaunchLockPath,
  resolveProjectTempSettingsDir,
  resolveProjectTempSettingsPath,
} from '../../src/core/paths.js'
import { createLaunchPresetService } from '../../src/services/launch-preset-service.js'
import { ensureProjectCcspStore } from '../../src/services/project-store-service.js'

// 高于 macOS/Linux 默认 pid_max，保证在测试机上不存在。
const DEAD_PID = 2147483646

// 批量 ps 是 pruner 里唯一一段「先拍快照、再等 IO、最后据快照下手」的窗口。真实的竞态靠时序
// 撞不出来，所以在这个 await 上挂一个钩子，精确地在窗口内改写锁文件。
const raceHook: { onProbe?: (() => Promise<void>) | undefined } = {}

vi.mock('../../src/core/process.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/core/process.js')>()
  return {
    ...actual,
    readProcessBootOffsets: async (pids: number[]) => {
      const bootOffsets = await actual.readProcessBootOffsets(pids)
      await raceHook.onProbe?.()
      return bootOffsets
    },
  }
})

describe('launch preset pruning races', () => {
  // ccsp 先只用自己的 pid 落锁，spawn 出 claude 之后才把子进程补写进去。若另一个 launch 恰好
  // 在这两步之间拍下快照，就会拿着「只有已死父进程」的旧视图，把已经归 claude 所有的锁连同它
  // 正在用的 settings / statusline 一起删掉。
  it('rechecks the lock after probing so an owner claimed mid-probe survives', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const claimedStem = 'aaa-claimed-mid-probe'
    const lockPath = resolveCcspLaunchLockPath(cwd, claimedStem)
    await writeFile(resolveProjectTempSettingsPath(cwd, `${claimedStem}-settings.json`), '{}')
    // 快照阶段：锁里只有一个已经退出的 ccsp 进程，看起来完全可回收。
    await writeFile(lockPath, JSON.stringify({ host: hostname(), pids: [DEAD_PID], owners: [{ pid: DEAD_PID, bootOffsetMs: 0 }] }))

    for (let index = 1; index <= 49; index += 1) {
      await writeFile(resolveProjectTempSettingsPath(cwd, `temp-${String(index).padStart(2, '0')}-settings.json`), '{}')
    }

    // 探测窗口内 claude 被登记进锁——它来得太晚，赶不上这一批 ps 的读数。
    raceHook.onProbe = async () => {
      await writeFile(lockPath, JSON.stringify({
        host: hostname(),
        pids: [DEAD_PID, process.pid],
        owners: [{ pid: DEAD_PID, bootOffsetMs: 0 }, { pid: process.pid, bootOffsetMs: 1 }],
      }))
      raceHook.onProbe = undefined
    }

    try {
      await service.writeTempSettings({}, 'zzz-newest')
    } finally {
      raceHook.onProbe = undefined
    }

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).toContain(`${claimedStem}-settings.json`)
    expect(remaining).toContain(`ccsp-launch-${claimedStem}.lock`)
    // 活会话被保住后，回收落到下一个最旧的 stem 上。
    expect(remaining).not.toContain('temp-01-settings.json')
  })
})
