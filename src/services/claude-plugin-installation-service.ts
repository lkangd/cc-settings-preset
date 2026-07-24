import spawn from 'cross-spawn'

import { isPlainObject } from '../core/is-plain-object.js'
import { pathExists, readJsonFileOrDefault } from '../core/json.js'
import { resolveUserClaudeInstalledPluginsPath } from '../core/paths.js'
import { resolvePluginRegistryKeys, type PluginState } from './plugin-service.js'

const PLUGIN_INSTALL_TIMEOUT_MS = 60_000
const FORCE_KILL_DELAY_MS = 5_000
const TERMINATION_SIGNALS: NodeJS.Signals[] = ['SIGHUP', 'SIGTERM']

type InstalledPluginRecord = Record<string, unknown>

export type PluginInstallationSyncResult = {
  failures: Array<{
    pluginName: string
    stderr: string
  }>
  warning?: string
}

type PluginInstallResult = {
  status: number | null
  stderr: string
}

export type PluginInstallRunner = (pluginName: string, projectPath: string) => Promise<PluginInstallResult>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function defaultPluginInstallRunner(pluginName: string, projectPath: string): Promise<PluginInstallResult> {
  return new Promise(resolve => {
    const child = spawn('claude', ['plugin', 'install', pluginName, '--scope', 'project'], {
      cwd: projectPath,
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    let settled = false
    let terminationSignal: NodeJS.Signals | undefined
    let forceKillTimer: NodeJS.Timeout | undefined

    const childAlive = () => child.exitCode === null && child.signalCode === null
    const killChild = (signal: NodeJS.Signals) => {
      if (!childAlive()) return
      try {
        child.kill(signal)
      } catch {
        // Child exited between the liveness check and kill attempt.
      }
    }
    const onProcessExit = () => killChild('SIGKILL')
    const forwardSignal = (signal: NodeJS.Signals) => {
      terminationSignal ??= signal
      killChild(signal)
      if (!forceKillTimer) {
        forceKillTimer = setTimeout(() => {
          killChild('SIGKILL')
        }, FORCE_KILL_DELAY_MS)
        forceKillTimer.unref?.()
      }
    }
    const timeout = setTimeout(() => {
      killChild('SIGKILL')
      finish({ status: 1, stderr: `Plugin installation timed out after ${PLUGIN_INSTALL_TIMEOUT_MS / 1000} seconds.` })
    }, PLUGIN_INSTALL_TIMEOUT_MS)
    timeout.unref?.()

    const cleanup = () => {
      clearTimeout(timeout)
      if (forceKillTimer) clearTimeout(forceKillTimer)
      for (const signal of TERMINATION_SIGNALS) process.removeListener(signal, forwardSignal)
      process.removeListener('exit', onProcessExit)
    }
    const finish = (result: PluginInstallResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
      if (terminationSignal) process.kill(process.pid, terminationSignal)
    }

    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })
    child.once('error', error => finish({ status: 1, stderr: error.message }))
    child.once('close', status => finish({ status, stderr }))

    for (const signal of TERMINATION_SIGNALS) process.on(signal, forwardSignal)
    process.on('exit', onProcessExit)
  })
}

function readPluginRecords(value: unknown): Record<string, InstalledPluginRecord[]> {
  if (!isPlainObject(value) || !isPlainObject(value.plugins)) return {}

  return Object.fromEntries(Object.entries(value.plugins).flatMap(([name, records]) =>
    Array.isArray(records) ? [[name, records.filter(isPlainObject)]] : [],
  ))
}

function isCurrentProjectRecord(record: InstalledPluginRecord, projectPath: string): record is InstalledPluginRecord & { installPath: string } {
  return record.scope === 'project' &&
    record.projectPath === projectPath &&
    typeof record.installPath === 'string' &&
    record.installPath.length > 0
}

async function hasCurrentProjectInstallation(
  pluginName: string,
  projectPath: string,
  plugins: Record<string, InstalledPluginRecord[]>,
): Promise<boolean> {
  const records = resolvePluginRegistryKeys(pluginName, Object.keys(plugins))
    .flatMap(key => plugins[key] ?? [])
    .filter(record => isCurrentProjectRecord(record, projectPath))

  const existing = await Promise.allSettled(records.map(record => pathExists(record.installPath)))
  return existing.some(result => result.status === 'fulfilled' && result.value)
}

export function createClaudePluginInstallationService(
  homeDir: string,
  runPluginInstall: PluginInstallRunner = defaultPluginInstallRunner,
) {
  const registryPath = resolveUserClaudeInstalledPluginsPath(homeDir)

  return {
    async synchronizeProjectPlugins(projectPath: string, pluginStates: PluginState[]): Promise<PluginInstallationSyncResult> {
      const pluginNames = [...new Set(pluginStates
        .filter(plugin => plugin.enabled && plugin.source !== 'user')
        .map(plugin => plugin.name))]
      if (pluginNames.length === 0) return { failures: [] }

      let plugins: Record<string, InstalledPluginRecord[]> = {}
      let warning: string | undefined
      try {
        plugins = readPluginRecords(await readJsonFileOrDefault(registryPath, {}))
      } catch (error) {
        warning = `Unable to read Claude plugin registry at ${registryPath}: ${errorMessage(error)}`
      }

      const installationStates = await Promise.all(pluginNames.map(async pluginName => ({
        pluginName,
        installed: await hasCurrentProjectInstallation(pluginName, projectPath, plugins),
      })))
      const failures: PluginInstallationSyncResult['failures'] = []

      // Claude owns one shared installation registry, so installs must not race each other.
      for (const { pluginName, installed } of installationStates) {
        if (installed) continue
        try {
          const result = await runPluginInstall(pluginName, projectPath)
          if (result.status !== 0) failures.push({ pluginName, stderr: result.stderr.trim() })
        } catch (error) {
          failures.push({ pluginName, stderr: errorMessage(error) })
        }
      }

      return { failures, ...(warning ? { warning } : {}) }
    },
  }
}
