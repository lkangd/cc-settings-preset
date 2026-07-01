import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { injectCcspStatusLine } from '../../src/services/statusline-injector-service.js'

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now()
    const tick = async () => {
      if (await predicate()) return resolve(true)
      if (Date.now() - start >= timeoutMs) return resolve(false)
      setTimeout(tick, 20)
    }
    void tick()
  })
}

function runWrapper(wrapperPath: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [wrapperPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', () => resolve(stdout))
    child.stdin.write(input)
    child.stdin.end()
  })
}

const projectRoot = '/tmp/ccsp-statusline-project'
const launchStem = '11111111-1111-4111-8111-111111111111'

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
        presetLabel: 'work',
        toggles: {
          plugins: [{ name: 'alpha', enabled: true, source: 'user' }],
          skills: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
          mcps: [{ name: 'github', enabled: true, source: 'project', config: {} }],
        },
      },
      context: { homeDir: '/tmp/home', cwd: projectRoot },
      stem: launchStem,
    })

    const tmpDir = join(projectRoot, '.claude', '.ccsp', 'tmp')
    const wrapperPath = join(tmpDir, `ccsp-statusline-${launchStem}.sh`)
    const wrapper = await fs.readFile(wrapperPath, 'utf8')

    expect(settings.statusLine).toEqual({
      type: 'command',
      command: wrapperPath,
      refreshInterval: 5,
    })
    expect(wrapper).toContain("printf '\\033[36m%s\\033[0m\\n' 'CCSP: work | plugins(1/1) | skills(0/1) | MCPs(1/1)'")
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
        presetLabel: 'web',
        toggles: {
          plugins: [],
          skills: [],
          mcps: [],
        },
      },
      context: { homeDir: '/tmp/home', cwd: projectRoot },
      stem: launchStem,
    })

    const tmpDir = join(projectRoot, '.claude', '.ccsp', 'tmp')
    const wrapperPath = join(tmpDir, `ccsp-statusline-${launchStem}.sh`)
    const underlyingPath = join(tmpDir, `ccsp-statusline-underlying-${launchStem}.sh`)
    const commandPath = join(tmpDir, `ccsp-statusline-underlying-${launchStem}.cmd`)

    expect(settings.statusLine.command).toBe(wrapperPath)
    await expect(fs.readFile(commandPath, 'utf8')).resolves.toBe("echo 'underlying'")
    await expect(fs.readFile(underlyingPath, 'utf8')).resolves.toContain(commandPath)
    await expect(fs.readFile(wrapperPath, 'utf8')).resolves.toContain(underlyingPath)
    await expect(fs.readFile(wrapperPath, 'utf8')).resolves.toContain("CCSP: web | plugins(0/0) | skills(0/0) | MCPs(0/0)")
  })

  // 端到端回归：真实 statusLine 命令（如 claude-hud）本身就是形如
  // `bash -c '...; exec node ...'` 的整条命令。CC 取消刷新时只 kill 它 spawn 的顶层 wrapper
  // 进程；如果 wrapper 把 underlying command fork 成子进程、又没有把信号转发下去，真正渲染
  // 的进程会孤儿化并继续持有 stdout 管道，旧会话 statusLine 就会卡死不再渲染。这里直接跑生成
  // 的脚本、发送 SIGTERM，验证真正持有管道的那个进程会被一起收掉，不留孤儿。
  it('propagates SIGTERM from the wrapper to the real underlying process, leaving no orphan', async () => {
    const marker = `ccsp-cancel-test-${Math.random().toString(36).slice(2, 10)}`
    const pidFile = join('/tmp', `${marker}.pid`)

    const settings = await injectCcspStatusLine({
      settings: {},
      resolved: {
        scope: 'user',
        // 复刻 claude-hud 的真实形状：整条命令自己在打印之后 `exec` 变身，
        // 用先写 PID 文件再 exec 的方式，让测试能独立于 wrapper 自身的 PID 拿到真凶。
        config: {
          type: 'command',
          command: `bash -c 'echo $$ > ${pidFile}; echo ${marker}; exec sleep 30'`,
        },
      },
      meta: {
        presetLabel: 'test',
        toggles: { plugins: [], skills: [], mcps: [] },
      },
      context: { homeDir: '/tmp/home', cwd: projectRoot },
      stem: launchStem,
    })

    const wrapperPath = settings.statusLine.command
    const child = spawn('bash', [wrapperPath], { stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdin.write('{}')
    child.stdin.end()

    // 注意：wrapper 只有在 underlying 命令完全跑完之后才会把输出 cat 到自己的 stdout
    // （需要先看退出码决定要不要吞掉输出），所以取消场景下 wrapper 自身的 stdout 永远
    // 等不到东西——这里改为轮询 pidFile，它由 underlying 进程在 exec 变身前直接写盘，
    // 不经过 wrapper 的缓冲，能在它还在跑的时候独立确认「真凶」PID。
    try {
      const sawPidFile = await waitFor(async () => {
        try {
          return (await fs.stat(pidFile)).size > 0
        } catch {
          return false
        }
      }, 1000)
      expect(sawPidFile).toBe(true)

      const underlyingPid = Number.parseInt((await fs.readFile(pidFile, 'utf8')).trim(), 10)
      expect(Number.isNaN(underlyingPid)).toBe(false)
      expect(isPidAlive(underlyingPid)).toBe(true)

      // 模拟 CC 取消刷新：只 kill 它 spawn 的那一个顶层 wrapper PID。
      child.kill('SIGTERM')

      const orphanGone = await waitFor(() => !isPidAlive(underlyingPid), 3000)
      expect(orphanGone).toBe(true)
    } finally {
      child.kill('SIGKILL')
      await fs.rm(pidFile, { force: true })
    }
  }, 10_000)

  // 早先的一版修复用 `eval "exec $cmd"` 起 underlying 命令，试图把它变成单进程替换；但
  // `exec` 只对紧跟它的第一条 simple command 生效——像 `printf a; printf b` 这种由 `;`/`&&`
  // 连接的复合命令，后半截会被直接跳过或语义走样。underlying 命令并不保证是单条简单命令
  // （用户可能配置任意 shell 片段），这里锁死复合命令必须完整跑完、两部分输出都要出现。
  it('runs compound underlying statusLine commands to completion, not just the first simple command', async () => {
    const settings = await injectCcspStatusLine({
      settings: {},
      resolved: {
        scope: 'user',
        config: { type: 'command', command: "printf 'part1-'; printf 'part2'" },
      },
      meta: { presetLabel: 'test', toggles: { plugins: [], skills: [], mcps: [] } },
      context: { homeDir: '/tmp/home', cwd: projectRoot },
      stem: launchStem,
    })

    const output = await runWrapper(settings.statusLine.command, '{}')
    expect(output).toContain('part1-part2')
  })

  // underlying 命令若逐字节处理 stdin（校验和、精确长度等），必须原样收到 CC 传入的 JSON，
  // 不能被多加一个字节。早先用 here-string（`<<<"$input"`）转发会隐式追加一个尾随换行。
  it('forwards stdin to the underlying command byte-for-byte, without an extra trailing newline', async () => {
    const settings = await injectCcspStatusLine({
      settings: {},
      resolved: {
        scope: 'user',
        config: { type: 'command', command: 'wc -c | tr -d " "' },
      },
      meta: { presetLabel: 'test', toggles: { plugins: [], skills: [], mcps: [] } },
      context: { homeDir: '/tmp/home', cwd: projectRoot },
      stem: launchStem,
    })

    const input = '{"key":"value"}'
    const output = await runWrapper(settings.statusLine.command, input)
    expect(output).toContain(`${input.length}\n`)
  })

  // wrapper 用 `cat "$tmp"` 原样转发 underlying 的输出；如果 underlying 打印时没带尾随换行，
  // 紧接着追加的 CCSP 行会和它拼在同一行。这里显式收拢成「$(cat) 去掉尾随换行后再补一个」，
  // 复刻原始实现里 command substitution 天然做的归一化，确保两段输出之间总有换行分隔。
  it('always separates underlying output from the CCSP line with a newline', async () => {
    const settings = await injectCcspStatusLine({
      settings: {},
      resolved: {
        scope: 'user',
        config: { type: 'command', command: "printf 'no-trailing-newline'" },
      },
      meta: { presetLabel: 'sep-test', toggles: { plugins: [], skills: [], mcps: [] } },
      context: { homeDir: '/tmp/home', cwd: projectRoot },
      stem: launchStem,
    })

    const output = await runWrapper(settings.statusLine.command, '{}')
    const lines = output.split('\n')
    expect(lines[0]).toBe('no-trailing-newline')
    expect(lines[1]).toContain('CCSP: sep-test')
  })
})
