import { spawn } from 'node:child_process'
import { uptime as osUptime } from 'node:os'
import { describe, expect, it } from 'vitest'

import {
  currentBootOffsetMs,
  isPidAlive,
  ownProcessBootOffsetMs,
  readProcessBootOffsets,
} from '../../src/core/process.js'

// 高于 macOS/Linux 默认 pid_max，保证在测试机上不存在。
const DEAD_PID = 2147483646

// 实现在 Windows 上没有 `ps` 可用，按设计一律返回「查不到」，所以依赖真实读数的断言只在
// POSIX 上跑。
const hasPs = process.platform !== 'win32'

// 起一个进程再收掉它，拿到一个「合法范围内、但已经没人占用」的 pid。
async function spawnAndReapPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''])
  await new Promise<void>((resolve, reject) => {
    child.once('close', () => resolve())
    child.once('error', reject)
  })
  return child.pid as number
}

describe('process', () => {
  it('reports the current process alive and an unused pid dead', () => {
    expect(isPidAlive(process.pid)).toBe(true)
    expect(isPidAlive(DEAD_PID)).toBe(false)
  })

  it.skipIf(hasPs)('reports every pid unknown where there is no ps', async () => {
    expect(await readProcessBootOffsets([process.pid])).toEqual(new Map())
  })

  it.runIf(hasPs)('observes a boot offset matching the one derived from process uptime', async () => {
    const bootOffsets = await readProcessBootOffsets([process.pid])
    const observed = bootOffsets.get(process.pid)

    expect(observed).toBeDefined()
    // `os.uptime()` 是整秒、`ps` 的 etime 也截断到整秒，所以只要求对得上 2s 以内。
    expect(Math.abs((observed as number) - ownProcessBootOffsetMs())).toBeLessThan(2000)
  })

  // 身份值必须只跟「进程何时启动」有关，跟当前时刻无关——否则每次读数都在变，根本无法比对。
  it.runIf(hasPs)('observes the same boot offset for a process across separate readings', async () => {
    const first = await readProcessBootOffsets([process.pid])
    await new Promise(resolve => setTimeout(resolve, 1100))
    const second = await readProcessBootOffsets([process.pid])

    expect(Math.abs((second.get(process.pid) as number) - (first.get(process.pid) as number))).toBeLessThan(2000)
  })

  it.runIf(hasPs)('places a freshly spawned process later on the boot clock than this one', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'])
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })

      const bootOffsets = await readProcessBootOffsets([child.pid as number, process.pid])
      expect(bootOffsets.get(child.pid as number)).toBeGreaterThan(ownProcessBootOffsetMs())
      // 刚 spawn 出来的进程，其 currentBootOffsetMs() 近似就是「现在」。
      expect(currentBootOffsetMs() - (bootOffsets.get(child.pid as number) as number)).toBeLessThan(2000)
    } finally {
      child.kill('SIGKILL')
    }
  })

  // 回收扫描一次批量查一整个 tmp 目录的 pid，里面必然混着刚退出的会话。Linux 的 `ps` 遇到
  // 消失的 pid 会整体以非零状态退出（stdout 里仍有活着的那几行），不能因此把活进程判成查不到。
  it.runIf(hasPs)('still reports live pids when the batch also names a freed one', async () => {
    const freedPid = await spawnAndReapPid()

    const bootOffsets = await readProcessBootOffsets([process.pid, freedPid])
    expect(bootOffsets.has(freedPid)).toBe(false)
    expect(bootOffsets.has(process.pid)).toBe(true)
  })

  // 锁文件被改坏时可能出现超出 pid 范围的数字，而 macOS 的 `ps` 会因为一个这样的参数拒掉
  // 整条查询，连带把同批的健康 pid 一起变成「查不到」。
  it.runIf(hasPs)('ignores an out-of-range pid instead of losing the whole batch', async () => {
    const bootOffsets = await readProcessBootOffsets([process.pid, DEAD_PID])
    expect(bootOffsets.has(DEAD_PID)).toBe(false)
    expect(bootOffsets.has(process.pid)).toBe(true)
  })

  it('returns nothing for an empty pid list without shelling out', async () => {
    expect(await readProcessBootOffsets([])).toEqual(new Map())
  })

  it('anchors both recording helpers to the boot clock, not the wall clock', () => {
    const uptimeMs = osUptime() * 1000
    expect(currentBootOffsetMs()).toBeLessThanOrEqual(uptimeMs + 1000)
    expect(ownProcessBootOffsetMs()).toBeLessThanOrEqual(currentBootOffsetMs())
    // 一个 epoch 毫秒值会是 1.7e12 量级；boot offset 必须远小于它，否则就是又锚回墙钟了。
    expect(currentBootOffsetMs()).toBeLessThan(Date.now() / 2)
  })
})
