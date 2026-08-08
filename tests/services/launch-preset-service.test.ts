import { mkdir, mkdtemp, readdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hostname, tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  resolveCcspLaunchLockPath,
  resolveCcspStatuslineUnderlyingCommandPath,
  resolveCcspStatuslineUnderlyingPath,
  resolveCcspStatuslineWrapperPath,
  resolveProjectTempSettingsDir,
  resolveProjectTempSettingsPath,
} from '../../src/core/paths.js'
import { ownProcessBootOffsetMs } from '../../src/core/process.js'
import { createLaunchPresetService } from '../../src/services/launch-preset-service.js'
import { ensureProjectCcspStore } from '../../src/services/project-store-service.js'

// 高于 macOS/Linux 默认 pid_max，保证在测试机上不存在，可当作「已退出的进程」。
const DEAD_PID = 2147483646

async function fillTempSettings(cwd: string, from: number, to: number): Promise<void> {
  for (let index = from; index <= to; index += 1) {
    const fileName = `temp-${String(index).padStart(2, '0')}-settings.json`
    await writeFile(resolveProjectTempSettingsPath(cwd, fileName), '{}')
  }
}

// `pids` 写的是旧版本 ccsp 的锁格式（只有 pid、没有身份），`owners` 是带 bootOffsetMs 的当前
// 格式；两者都要能被读懂，所以测试按用例分别落哪一种。
async function writeLaunchLock(
  cwd: string,
  stem: string,
  lock: { host?: string; pids?: number[]; owners?: Array<{ pid: number; bootOffsetMs?: number }> },
): Promise<void> {
  await writeFile(
    resolveCcspLaunchLockPath(cwd, stem),
    JSON.stringify({
      host: lock.host ?? hostname(),
      ...(lock.pids ? { pids: lock.pids } : {}),
      ...(lock.owners ? { owners: lock.owners } : {}),
    }),
  )
}

describe('launch preset service', () => {
  it('creates, lists, reads, renames, and deletes project launch presets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    const created = await service.createPreset('Web Dev', {
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })

    expect(created.name).toBe('Web-Dev')
    expect(created.fileName).toBe('Web-Dev-launch.json')
    expect(await service.listPresets()).toEqual([created])
    expect(await service.readPresetSettings('web-dev')).toEqual({
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })

    const renamed = await service.renamePreset('Web-Dev', 'Api Work')
    expect(renamed.name).toBe('Api-Work')
    expect(await service.listPresets()).toEqual([renamed])

    await service.deletePreset('api-work')
    expect(await service.listPresets()).toEqual([])
  })

  it('lists launch presets together with settings in one call', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.createPreset('Web Dev', {
      enabledPlugins: { alpha: false },
      skillOverrides: { personal: 'off' },
      deniedMcpServers: [{ serverName: 'github' }],
    })

    expect(await service.listPresetsWithSettings()).toEqual([
      {
        meta: expect.objectContaining({ name: 'Web-Dev', fileName: 'Web-Dev-launch.json' }),
        settings: {
          enabledPlugins: { alpha: false },
          skillOverrides: { personal: 'off' },
          deniedMcpServers: [{ serverName: 'github' }],
        },
      },
    ])
  })

  it('rejects duplicate project launch preset names', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.createPreset('web', {})

    await expect(service.createPreset('web', {})).rejects.toThrow('Launch preset already exists: web')
    await expect(service.createPreset('Web', {})).rejects.toThrow('Launch preset already exists: Web')
  })

  it('preserves case when creating project launch presets', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    const created = await service.createPreset('Expert', {})
    expect(created.name).toBe('Expert')
    expect(created.fileName).toBe('Expert-launch.json')
    expect((await service.listPresets()).map(preset => preset.name)).toEqual(['Expert'])
  })

  it('stores and resolves last-used launch preset', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.createPreset('web', {})
    await service.writeLastUsed('web')

    expect(await service.readLastUsed()).toBe('web')

    await service.deletePreset('web')

    expect(await service.readLastUsed()).toBeUndefined()
  })

  it('treats dot and hyphen normalized rename targets as the same preset', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.createPreset('gpt-5-4', {})
    const renamed = await service.renamePreset('gpt-5-4', 'gpt-5.4')

    expect(renamed.name).toBe('gpt-5.4')
    expect((await service.listPresets()).map(preset => preset.name)).toEqual(['gpt-5.4'])
  })

  it('writes retained temp settings files keyed by stem', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    const filePath = await service.writeTempSettings({ enabledPlugins: { alpha: true } }, 'session-stem')

    expect(filePath).toContain('.claude/.ccsp/tmp/')
    expect(filePath.endsWith('session-stem-settings.json')).toBe(true)
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toEqual({ enabledPlugins: { alpha: true } })
  })

  it('prunes oldest temp settings when more than 50 files exist', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    await fillTempSettings(cwd, 0, 49)

    await service.writeTempSettings({}, 'zzz-newest')

    const tempDir = resolveProjectTempSettingsDir(cwd)
    const remaining = (await readdir(tempDir))
      .filter(fileName => fileName.endsWith('-settings.json'))
      .sort()

    expect(remaining).toHaveLength(50)
    expect(remaining).not.toContain('temp-00-settings.json')
    expect(remaining).toContain('temp-01-settings.json')
    expect(remaining).toContain('zzz-newest-settings.json')
  })

  it('never prunes the temp settings file it just wrote', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    await fillTempSettings(cwd, 0, 49)

    const filePath = await service.writeTempSettings({}, 'aaa-newest')

    const tempDir = resolveProjectTempSettingsDir(cwd)
    const remaining = (await readdir(tempDir))
      .filter(fileName => fileName.endsWith('-settings.json'))
      .sort()

    expect(remaining).toHaveLength(50)
    expect(remaining).toContain('aaa-newest-settings.json')
    await expect(readFile(filePath, 'utf8')).resolves.toBe('{}\n')
  })

  it('prunes related ccsp statusline scripts with oldest temp settings', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const oldestStem = 'aaa-oldest'
    const oldestSettings = `${oldestStem}-settings.json`
    await writeFile(resolveProjectTempSettingsPath(cwd, oldestSettings), '{}')
    await writeFile(resolveCcspStatuslineWrapperPath(cwd, oldestStem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingPath(cwd, oldestStem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingCommandPath(cwd, oldestStem), "echo 'old'\n")

    await fillTempSettings(cwd, 1, 49)

    await service.writeTempSettings({}, 'zzz-newest')

    const tempDir = resolveProjectTempSettingsDir(cwd)
    const remaining = await readdir(tempDir)

    expect(remaining).not.toContain(`ccsp-statusline-${oldestStem}.sh`)
    expect(remaining).not.toContain(`ccsp-statusline-underlying-${oldestStem}.sh`)
    expect(remaining).not.toContain(`ccsp-statusline-underlying-${oldestStem}.cmd`)
    expect(remaining).not.toContain(oldestSettings)
  })

  // 同一项目目录并发开多个会话时，新会话的 writeTempSettings 也会 prune 同一个 tmp 目录。
  // 早先的排序键取自按 sessionId 索引的 sessions.json（stem 是 ccsp 自己生成的 UUID，永远
  // 对不上），实际退化成按 stem 字典序删任意一个——包括正在运行的会话，它的 statusline
  // 脚本一旦被删，旧会话的 statusline 立刻消失。这里锁死：持有存活 pid 锁的 stem 不可回收。
  it('never prunes stems still owned by a live ccsp process', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    // 最老的一批里插入一个「正在运行的会话」：文件最旧，但锁指向存活进程。
    const liveStem = 'aaa-live-session'
    await writeFile(resolveProjectTempSettingsPath(cwd, `${liveStem}-settings.json`), '{}')
    await writeLaunchLock(cwd, liveStem, { pids: [process.pid] })
    await writeFile(resolveCcspStatuslineWrapperPath(cwd, liveStem), '#!/bin/bash\n')

    await fillTempSettings(cwd, 1, 49)

    await service.writeTempSettings({}, 'zzz-newest')

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).toContain(`${liveStem}-settings.json`)
    expect(remaining).toContain(`ccsp-statusline-${liveStem}.sh`)
    // 存活会话被跳过后，回收落到下一个最旧的 stem 上。
    expect(remaining).not.toContain('temp-01-settings.json')
  })

  it('reclaims stems whose lock points at a dead process', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    // ccsp 被 SIGKILL 时来不及跑 finally，锁会留在盘上；它不能把 stem 永久钉住。
    const deadStem = 'aaa-dead-session'
    await writeFile(resolveProjectTempSettingsPath(cwd, `${deadStem}-settings.json`), '{}')
    await writeLaunchLock(cwd, deadStem, { pids: [DEAD_PID] })

    await fillTempSettings(cwd, 1, 49)

    await service.writeTempSettings({}, 'zzz-newest')

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).not.toContain(`${deadStem}-settings.json`)
    expect(remaining).not.toContain(`ccsp-launch-${deadStem}.lock`)
    expect(remaining).toContain('temp-01-settings.json')
  })

  // ccsp 可能被 SIGKILL（它无法处理），此时 claude 会被 reparent 继续运行，仍然依赖这个
  // stem 的 settings 与 statusline 脚本——只看 ccsp pid 会把这种活会话判成已退出。
  it('keeps stems alive on the claude pid after the ccsp pid is gone', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const orphanedStem = 'aaa-orphaned-claude'
    await writeFile(resolveProjectTempSettingsPath(cwd, `${orphanedStem}-settings.json`), '{}')
    await writeLaunchLock(cwd, orphanedStem, { pids: [DEAD_PID, process.pid] })
    await fillTempSettings(cwd, 1, 49)

    await service.writeTempSettings({}, 'zzz-newest')

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).toContain(`${orphanedStem}-settings.json`)
    expect(remaining).not.toContain('temp-01-settings.json')
  })

  // pid 会被 OS 回收：ccsp 被 SIGKILL 留下的锁，其 pid 迟早会落到一个毫不相干的进程头上。
  // 只看 kill(pid, 0) 会把这种 stem 永久钉死在 tmp 目录里，得靠记录的启动时刻把 pid 认回具体进程。
  it('reclaims a stem whose live pid started later than the lock recorded', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const recycledStem = 'aaa-recycled-pid'
    await writeFile(resolveProjectTempSettingsPath(cwd, `${recycledStem}-settings.json`), '{}')
    // pid 存活（就是本测试进程），但它的真实启动时刻远晚于锁里记的那个——说明写锁的进程早没了。
    await writeLaunchLock(cwd, recycledStem, { owners: [{ pid: process.pid, bootOffsetMs: 0 }] })
    await fillTempSettings(cwd, 1, 49)

    await service.writeTempSettings({}, 'zzz-newest')

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).not.toContain(`${recycledStem}-settings.json`)
    expect(remaining).not.toContain(`ccsp-launch-${recycledStem}.lock`)
    expect(remaining).toContain('temp-01-settings.json')
  })

  // 身份对得上时不能误伤：startedAt 与进程实际启动时刻一致，就是原主还在。
  it('keeps a stem whose live pid still matches the recorded start time', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const liveStem = 'aaa-identified-live'
    await writeFile(resolveProjectTempSettingsPath(cwd, `${liveStem}-settings.json`), '{}')
    await writeLaunchLock(cwd, liveStem, { owners: [{ pid: process.pid, bootOffsetMs: ownProcessBootOffsetMs() }] })
    await fillTempSettings(cwd, 1, 49)

    await service.writeTempSettings({}, 'zzz-newest')

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).toContain(`${liveStem}-settings.json`)
    expect(remaining).not.toContain('temp-01-settings.json')
  })

  // 身份值锚在 boot clock 上而不是墙钟上：NTP 或手动校时把系统时间前拨，不能让还活着的
  // owner 看起来像是「pid 被别人复用了」，否则活会话的 settings 会被当场删掉。
  it('keeps a live stem identified across a forward wall-clock jump', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const liveStem = 'aaa-clock-jump'
    await writeFile(resolveProjectTempSettingsPath(cwd, `${liveStem}-settings.json`), '{}')
    await writeLaunchLock(cwd, liveStem, { owners: [{ pid: process.pid, bootOffsetMs: ownProcessBootOffsetMs() }] })
    await fillTempSettings(cwd, 1, 49)

    // 把 Date.now() 整体前拨一小时；boot offset 不经过墙钟，判定必须完全不受影响。
    const realNow = Date.now
    Date.now = () => realNow.call(Date) + 60 * 60 * 1000
    try {
      await service.writeTempSettings({}, 'zzz-newest')
    } finally {
      Date.now = realNow
    }

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).toContain(`${liveStem}-settings.json`)
    expect(remaining).not.toContain('temp-01-settings.json')
  })

  // 双写的两份表示若对不上（锁被改坏、或别的写入方只更新了一半），必须取并集：只出现在
  // legacy pids 里的 pid 同样是一份占用声明，不能因为 owners 是空数组就把 stem 回收掉。
  it('keeps a stem whose live pid survives only in the legacy pids mirror', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const mirroredStem = 'aaa-mirror-only'
    await writeFile(resolveProjectTempSettingsPath(cwd, `${mirroredStem}-settings.json`), '{}')
    await writeLaunchLock(cwd, mirroredStem, { pids: [process.pid], owners: [] })
    await fillTempSettings(cwd, 1, 49)

    await service.writeTempSettings({}, 'zzz-newest')

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).toContain(`${mirroredStem}-settings.json`)
    expect(remaining).toContain(`ccsp-launch-${mirroredStem}.lock`)
    expect(remaining).not.toContain('temp-01-settings.json')
  })

  // 同一目录被另一台主机 / 另一个 PID namespace（容器有自己的 hostname 和 pid 编号）共享时，
  // 本机的 kill(pid, 0) 对它的 pid 毫无意义，不能据此判定对方已经退出。
  it('never reclaims a lock written on another host', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const foreignStem = 'aaa-other-host'
    await writeFile(resolveProjectTempSettingsPath(cwd, `${foreignStem}-settings.json`), '{}')
    await writeLaunchLock(cwd, foreignStem, { host: 'some-other-host', pids: [DEAD_PID] })
    await fillTempSettings(cwd, 1, 49)

    await service.writeTempSettings({}, 'zzz-newest')

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).toContain(`${foreignStem}-settings.json`)
    expect(remaining).toContain(`ccsp-launch-${foreignStem}.lock`)
    expect(remaining).not.toContain('temp-01-settings.json')
  })

  // 锁先于 settings 文件写入，而 pruner 只枚举有 settings 文件的 stem：中途失败若不回滚，
  // 留下的锁再也不会被任何一次回收扫描到。
  it('rolls the stem back when the temp settings write fails', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    const stem = 'doomed-stem'
    // 用目录占住目标路径，让原子写的 rename 必定失败。
    await mkdir(resolveProjectTempSettingsPath(cwd, `${stem}-settings.json`))
    await writeFile(resolveCcspStatuslineWrapperPath(cwd, stem), '#!/bin/bash\n')

    await expect(service.writeTempSettings({}, stem)).rejects.toThrow()

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).not.toContain(`ccsp-launch-${stem}.lock`)
    expect(remaining).not.toContain(`ccsp-statusline-${stem}.sh`)
  })

  it('prunes oldest by settings file mtime rather than stem name order', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    await ensureProjectCcspStore(cwd)

    await fillTempSettings(cwd, 0, 49)
    // 字典序最靠前、但实际是最近一次写入的 stem——不能被当成「最旧」删掉。
    await utimes(resolveProjectTempSettingsPath(cwd, 'temp-00-settings.json'), new Date(), new Date())

    await service.writeTempSettings({}, 'zzz-newest')

    const remaining = await readdir(resolveProjectTempSettingsDir(cwd))
    expect(remaining).toContain('temp-00-settings.json')
    expect(remaining).not.toContain('temp-01-settings.json')
  })

  it('releases the launch lock on exit so the stem becomes prunable again', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    const stem = 'session-stem'

    await service.writeTempSettings({}, stem)
    expect(JSON.parse(await readFile(resolveCcspLaunchLockPath(cwd, stem), 'utf8'))).toEqual({
      host: hostname(),
      // 旧版本 ccsp 只认 pids：缺了它，旧版本会把这个锁读成「无人持有」。
      pids: [process.pid],
      owners: [{ pid: process.pid, bootOffsetMs: expect.any(Number) }],
    })

    await service.cleanupTempScripts(stem)

    expect(await readdir(resolveProjectTempSettingsDir(cwd))).toEqual([`${stem}-settings.json`])
  })

  it('removes only scripts on exit and keeps the settings file', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    const stem = 'session-stem'

    const settingsPath = await service.writeTempSettings({ enabledPlugins: { alpha: true } }, stem)
    await writeFile(resolveCcspStatuslineWrapperPath(cwd, stem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingPath(cwd, stem), '#!/bin/bash\n')
    await writeFile(resolveCcspStatuslineUnderlyingCommandPath(cwd, stem), "echo 'underlying'\n")

    await service.cleanupTempScripts(stem)

    const tempDir = resolveProjectTempSettingsDir(cwd)
    expect(await readdir(tempDir)).toEqual([`${stem}-settings.json`])
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual({ enabledPlugins: { alpha: true } })
  })

  it('binds, reads, and re-touches session launch configs', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    const input = {
      sessionId: 'sess-a',
      globalName: 'work',
      projectPresetName: 'web',
      presetLabel: 'work/web',
      baseSettings: { permissions: { allow: ['Read(*)'] } },
      launchSettings: { enabledPlugins: { alpha: true } },
      toggles: { plugins: [], skills: [], mcps: [] },
    }

    await service.writeSessionBinding(input)
    const first = await service.readSessionBinding('sess-a')
    expect(first?.globalName).toBe('work')
    expect(first?.presetLabel).toBe('work/web')
    expect(first?.launchSettings).toEqual({ enabledPlugins: { alpha: true } })
    expect(first?.exitedAt).toBeUndefined()

    await service.recordSessionExit('sess-a')
    const exited = await service.readSessionBinding('sess-a')
    expect(exited?.exitedAt).toBeTruthy()

    await service.writeSessionBinding(input)
    const reused = await service.readSessionBinding('sess-a')
    expect(reused?.createdAt).toBe(first?.createdAt)
    expect(reused?.exitedAt).toBeUndefined()
  })

  it('keeps session bindings valid when preset labels are omitted', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)

    await service.writeSessionBinding({
      sessionId: 'sess-a',
      globalName: 'work',
      projectPresetName: 'web',
      baseSettings: {},
      launchSettings: {},
      toggles: { plugins: [], skills: [], mcps: [] },
    })

    const binding = await service.readSessionBinding('sess-a')
    expect(binding?.presetLabel).toBeUndefined()
  })

  it('continues the most recently exited session', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ccsp-project-'))
    const service = createLaunchPresetService(cwd)
    const base = {
      globalName: 'work',
      projectPresetName: 'web',
      presetLabel: 'work/web',
      baseSettings: {},
      launchSettings: {},
      toggles: { plugins: [], skills: [], mcps: [] },
    }

    await service.writeSessionBinding({ ...base, sessionId: 'sess-a' })
    await service.writeSessionBinding({ ...base, sessionId: 'sess-b' })

    // A launched first then B, but A exits first → --continue should pick A.
    await service.recordSessionExit('sess-a')

    const latest = await service.findLatestExitedSession()
    expect(latest?.sessionId).toBe('sess-a')
  })
})
