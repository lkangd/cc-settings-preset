#!/usr/bin/env node
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { Command } from 'commander'
import { render, Text, type Instance } from 'ink'
import figlet from 'figlet'

import { randomUUID } from 'node:crypto'
import { isUuid, parseDirectRunOptions, resolveSessionLaunch, sanitizeClaudeArgs, type DirectRunOptions } from './core/args.js'
import { isCcspCommanderSubcommand } from './core/commands.js'
import { resolvePresetIndexKey } from './core/name.js'
import { CliError } from './core/errors.js'
import { readJsonFile } from './core/json.js'
import { createPathContext, resolveGlobalRoot, resolveUserClaudeSettingsPath } from './core/paths.js'
import { parseSettings, type CcspConfig, type PresetMeta, type RunMode, type SessionBinding, type SettingsDisplayFormat } from './core/schema.js'
import { spawnClaude } from './core/spawn.js'
import { ConfigApp } from './ink/config-app.js'
import { CreateApp, type CreateResult, type CreateSubmitResult } from './ink/create-app.js'
import { GlobalShortcutHandler } from './ink/components/global-shortcut-handler.js'
import { InkResizeProvider } from './ink/components/resize-context.js'
import type { DisableRemovalMark, ProjectLaunchToggleState } from './flows/project-launch-flow.js'
import { applyDisableRemovals } from './services/disable-lock-service.js'
import { ManageApp, type ManageResult } from './ink/manage-app.js'
import { ProjectLaunchApp, type ProjectLaunchResult } from './ink/project-launch-app.js'
import { ProjectManageApp, type ProjectManageResult } from './ink/project-manage-app.js'
import { DirectRunPreviewApp } from './ink/direct-run-preview-app.js'
import { SettingsSelectApp, type SettingsSelectResult } from './ink/settings-select-app.js'
import { applyPluginOverrides, pluginStatesToEnabledPlugins, resolvePluginStates } from './services/plugin-service.js'
import { createCcspConfigService } from './services/ccsp-config-service.js'
import { createGlobalLastSettingsService } from './services/global-last-settings-service.js'
import { createClaudeSessionService } from './services/claude-session-service.js'
import { createLaunchPresetService } from './services/launch-preset-service.js'
import {
  applyDeniedMcpServers,
  applyPluginMcpAvailability,
  discoverMcpStates,
  mcpStatesToDeniedServers,
  resolveDeniedMcpServers
} from './services/mcp-service.js'
import { createClaudeLoginService } from './services/claude-login-service.js'
import { CLAUDE_OFFICIAL_PRESET_NAME, createPresetService } from './services/preset-service.js'
import { createSettingsSourceService, type SettingsSource } from './services/settings-source-service.js'
import {
  finalizeLaunchSettings,
  resolveProjectPresetName,
} from './services/settings-finalizer-service.js'
import {
  applySkillOverrides,
  discoverSkillStates,
  resolveSkillOverrides,
  skillStatesToOverrides
} from './services/skill-service.js'
import { VERSION } from './version.js'

const h = React.createElement

const context = createPathContext()
const globalRoot = resolveGlobalRoot(context.homeDir)
const presetService = createPresetService(globalRoot)
const settingsSourceService = createSettingsSourceService(context)
const globalLastSettingsService = createGlobalLastSettingsService(context.homeDir)
const ccspConfigService = createCcspConfigService(globalRoot)
const launchPresetService = createLaunchPresetService(context.cwd)
const claudeSessionService = createClaudeSessionService(context.homeDir, context.cwd)
const claudeLoginService = createClaudeLoginService(context)

async function buildClaudeOfficialPresetItem(): Promise<SettingsSelectResult | undefined> {
  if (!(await claudeLoginService.isLoggedIn())) return undefined
  return presetService.buildClaudeOfficialItem(resolveUserClaudeSettingsPath(context.homeDir))
}

export function createProgram(): Command {
  const program = new Command()
  program
    .name('ccsp/cc-settings-preset')
    .description(`Select Claude Code runtime settings presets (v${VERSION})`)
    .version(VERSION)

  program
    .command('create')
    .description('Create a first-level settings preset')
    .action(async () => {
      printBanner()
      await createPresetInteractive()
    })

  program
    .command('manage')
    .description('Manage settings presets')
    .option('-p, --project', 'Manage project launch presets')
    .action(async (options: { project?: boolean }) => {
      printBanner()
      if (options.project) {
        await manageProjectInteractive()
        return
      }
      await manageInteractive()
    })

  program
    .command('config')
    .description('Configure ccsp preferences')
    .action(async () => {
      printBanner()
      await configInteractive()
    })

  return program
}

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

function visibleWidth(value: string): number {
  return stripAnsi(value).length
}

function centerVisibleLine(line: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - visibleWidth(line)) / 2))
  return `${' '.repeat(pad)}${line}`
}

function createBannerCandidates(): string[][] {
  const cyan = '\x1b[36m'
  const reset = '\x1b[0m'
  const fonts = ['ANSI Shadow', 'Small'] as const

  const figletCandidates = fonts.map(font =>
    figlet
      .textSync('C C S P', { font })
      .split('\n')
      .map(line => `${cyan}${line}${reset}`)
  )

  return [...figletCandidates, [`${cyan}C C S P${reset}`], [`${cyan}CCSP${reset}`]]
}

function selectBannerCandidate(width: number, candidates: string[][]): string[] {
  return candidates.find(lines => Math.max(...lines.map(visibleWidth)) <= width) ?? candidates.at(-1) ?? []
}

export function buildBannerLines(columns: number): string[] {
  const cyan = '\x1b[36m'
  const dim = '\x1b[2m'
  const reset = '\x1b[0m'
  const safeColumns = Math.max(1, columns)
  const headline = selectBannerCandidate(safeColumns, createBannerCandidates()).map(line =>
    centerVisibleLine(line, safeColumns)
  )
  const subtitle = centerVisibleLine(`${dim}${cyan}CC-Settings-Preset${reset}`, safeColumns)
  const dividerWidth = Math.min(safeColumns, Math.max(stripAnsi(subtitle).length, 12))
  const divider = centerVisibleLine(`${dim}${'─'.repeat(dividerWidth)}${reset}`, safeColumns)

  return [...headline, subtitle, divider]
}

export function printBanner() {
  const columns = process.stderr.columns ?? 80
  const lines = buildBannerLines(columns)
  process.stderr.write(`\n\n${lines.join('\n')}\n\n`)
}

const CLEAR_TERMINAL_HISTORY = '\x1b[3J\x1b[H\x1b[2J'
const REFRESH_MARKERS = ['​', '⁠'] as const

export function clearTerminalScreen(stdout: Pick<NodeJS.WriteStream, 'write'> = process.stdout) {
  stdout.write(CLEAR_TERMINAL_HISTORY)
}

type ShortcutKey = {
  ctrl?: boolean
}

type RefreshableInkApp = Pick<Instance, 'clear' | 'rerender' | 'waitUntilExit'>

type RefreshState = {
  resizeVersion: number
}

function rerenderInkApp(
  app: RefreshableInkApp,
  createNode: () => React.ReactElement,
  stdout: Pick<NodeJS.WriteStream, 'write'>,
  state: RefreshState,
  onShortcut: (input: string, key: ShortcutKey) => void
) {
  state.resizeVersion += 1
  clearTerminalScreen(stdout)
  app.clear()
  app.rerender(wrapInkNode(createNode, state.resizeVersion, onShortcut))
}

export function createGlobalShortcutHandler(
  app: RefreshableInkApp,
  createNode: () => React.ReactElement,
  stdout: Pick<NodeJS.WriteStream, 'write'> = process.stdout,
  state: RefreshState = { resizeVersion: 0 },
  onShortcut?: (input: string, key: ShortcutKey) => void
) {
  return (input: string, key: ShortcutKey) => {
    if (key.ctrl && input === 'l') {
      rerenderInkApp(app, createNode, stdout, state, onShortcut ?? (() => {}))
    }
  }
}

function wrapInkNode(
  createNode: () => React.ReactElement,
  resizeVersion: number,
  onShortcut: (input: string, key: ShortcutKey) => void
): React.ReactElement {
  const marker = REFRESH_MARKERS[resizeVersion % REFRESH_MARKERS.length]

  return h(InkResizeProvider, {
    value: resizeVersion,
    children: h(GlobalShortcutHandler, {
      onShortcut,
      children: h(React.Fragment, {
        children: [h(Text, { key: 'refresh-marker' }, marker), React.cloneElement(createNode(), { key: 'app-node' })]
      })
    })
  })
}

export async function waitForInkAppExit(
  app: RefreshableInkApp,
  createNode: () => React.ReactElement,
  stdout: Pick<NodeJS.WriteStream, 'on' | 'off' | 'write'> = process.stdout,
  state: RefreshState = { resizeVersion: 0 },
  onShortcut: (input: string, key: ShortcutKey) => void = () => {}
): Promise<void> {
  const rerender = () => {
    rerenderInkApp(app, createNode, stdout, state, onShortcut)
  }

  stdout.on('resize', rerender)

  try {
    await app.waitUntilExit()
  } finally {
    stdout.off('resize', rerender)
  }
}

async function renderCreateApp(): Promise<PresetMeta | undefined> {
  const sources = (await settingsSourceService.discoverSettingsSources()).map(source => ({
    label: source.scope,
    filePath: source.filePath
  }))
  let result: PresetMeta | undefined
  const createNode = () =>
    h(CreateApp, {
      sources,
      onSubmit: async (value: CreateResult): Promise<CreateSubmitResult> => {
        try {
          result = await presetService.createBasePreset(value.name, await readJsonFile(value.sourcePath))
          return { ok: true }
        } catch (error) {
          const knownError = CliError.is(error, 'preset_already_exists')
          if (knownError) {
            return { ok: false, error: knownError }
          }
          throw error
        }
      }
    })
  const state = { resizeVersion: 0 }
  let app: RefreshableInkApp
  const onShortcut = (input: string, key: ShortcutKey) => {
    createGlobalShortcutHandler(app, createNode, process.stdout, state, onShortcut)(input, key)
  }
  app = render(wrapInkNode(createNode, state.resizeVersion, onShortcut))
  await waitForInkAppExit(app, createNode, process.stdout, state, onShortcut)
  return result
}

async function configInteractive(): Promise<void> {
  const initialConfig = await ccspConfigService.read()
  const createNode = () =>
    h(ConfigApp, {
      initialConfig,
      onChange: (config) => {
        void ccspConfigService.write(config)
      }
    })
  const state = { resizeVersion: 0 }
  let app: RefreshableInkApp
  const onShortcut = (input: string, key: ShortcutKey) => {
    createGlobalShortcutHandler(app, createNode, process.stdout, state, onShortcut)(input, key)
  }
  app = render(wrapInkNode(createNode, state.resizeVersion, onShortcut))
  await waitForInkAppExit(app, createNode, process.stdout, state, onShortcut)
}

async function renderSettingsSelectApp(
  items: SettingsSelectResult[],
  options: {
    initialName?: string
    initialEnvOnly?: boolean
    displayFormat?: SettingsDisplayFormat
  } = {}
): Promise<SettingsSelectResult | undefined> {
  let result: SettingsSelectResult | undefined
  const createNode = () =>
    h(SettingsSelectApp, {
      items,
      ...options,
      onSubmit: (value: SettingsSelectResult) => {
        result = value
      }
    })
  const state = { resizeVersion: 0 }
  let app: RefreshableInkApp
  const onShortcut = (input: string, key: ShortcutKey) => {
    createGlobalShortcutHandler(app, createNode, process.stdout, state, onShortcut)(input, key)
  }
  app = render(wrapInkNode(createNode, state.resizeVersion, onShortcut))
  await waitForInkAppExit(app, createNode, process.stdout, state, onShortcut)
  return result
}

async function buildGlobalSettingsPresetItems(): Promise<SettingsSelectResult[]> {
  const presets = (await presetService.listPresets()).filter(preset => preset.type === 'base')
  const items: SettingsSelectResult[] = []
  for (const preset of presets) {
    items.push({
      name: preset.name,
      sourcePath: await presetService.getPresetPath(preset.name),
      settings: await presetService.readPresetSettings(preset.name)
    })
  }
  return items
}

async function resolveProjectManageBaseSettings(): Promise<SettingsSelectResult | undefined> {
  const [source] = await settingsSourceService.discoverSettingsSources()
  if (!source) return undefined

  return {
    name: source.scope,
    sourcePath: source.filePath,
    settings: source.settings,
    temporary: true
  }
}

async function resolveInteractiveBaseSettings(config?: CcspConfig): Promise<SettingsSelectResult | undefined> {
  const officialItem = await buildClaudeOfficialPresetItem()
  const presetItems = [...(officialItem ? [officialItem] : []), ...(await buildGlobalSettingsPresetItems())]
  if (presetItems.length > 0) {
    const rememberedName = await globalLastSettingsService.readLastUsed(context.cwd)
    const initialName =
      rememberedName && presetItems.some(preset => preset.name === rememberedName) ? rememberedName : undefined
    const { globalPresetEnvOnly, settingsDisplayFormat } = config ?? await ccspConfigService.read()
    const selected = await renderSettingsSelectApp(presetItems, {
      ...(initialName ? { initialName } : {}),
      initialEnvOnly: globalPresetEnvOnly,
      displayFormat: settingsDisplayFormat,
    })
    if (selected) await globalLastSettingsService.writeLastUsed(context.cwd, selected.name)
    return selected
  }

  return {
    name: 'temporary-empty-base',
    sourcePath: '',
    settings: {},
    temporary: true
  }
}

async function buildProjectLaunchInput(selectedSettings: SettingsSelectResult): Promise<{
  presets: Awaited<ReturnType<typeof launchPresetService.listPresets>>
  detected: ProjectLaunchToggleState
  statesByPreset: Record<string, ProjectLaunchToggleState>
  disableLockSources: Array<
    SettingsSource | { scope: 'preset'; filePath: string; settings: SettingsSelectResult['settings'] }
  >
  lastUsedName?: string
}> {
  const sources = await settingsSourceService.discoverSettingsSources()
  const settingsSources = [
    ...sources,
    { scope: 'preset' as const, filePath: selectedSettings.sourcePath, settings: selectedSettings.settings }
  ]
  const basePlugins = resolvePluginStates(settingsSources)
  const baseSkills = applySkillOverrides(
    await discoverSkillStates({
      homeDir: context.homeDir,
      cwd: context.cwd,
      enabledPlugins: Object.fromEntries(
        basePlugins.filter(plugin => plugin.enabled).map(plugin => [plugin.name, true])
      )
    }),
    resolveSkillOverrides(settingsSources)
  )
  const rawMcps = await discoverMcpStates({
    homeDir: context.homeDir,
    cwd: context.cwd,
    knownPlugins: basePlugins.map(plugin => plugin.name)
  })
  const baseMcps = applyDeniedMcpServers(
    applyPluginMcpAvailability(rawMcps, basePlugins),
    resolveDeniedMcpServers(settingsSources)
  )
  const launchPresets = await launchPresetService.listPresets()
  const statesByPreset: Record<string, ProjectLaunchToggleState> = {}

  for (const preset of launchPresets) {
    const settings = await launchPresetService.readPresetSettings(preset.name)
    const presetPlugins = applyPluginOverrides(basePlugins, settings.enabledPlugins)
    statesByPreset[preset.name] = {
      plugins: presetPlugins,
      skills: applySkillOverrides(baseSkills, settings.skillOverrides),
      mcps: applyDeniedMcpServers(applyPluginMcpAvailability(rawMcps, presetPlugins), settings.deniedMcpServers)
    }
  }

  const lastUsedName = await launchPresetService.readLastUsed()
  return {
    presets: launchPresets,
    detected: { plugins: basePlugins, skills: baseSkills, mcps: baseMcps },
    statesByPreset,
    disableLockSources: settingsSources,
    ...(lastUsedName ? { lastUsedName } : {})
  }
}

async function applyLaunchDisableRemovals(removals?: DisableRemovalMark[]): Promise<void> {
  if (!removals || removals.length === 0) return
  await applyDisableRemovals(removals)
}

async function renderProjectLaunchApp(
  selectedSettings: SettingsSelectResult
): Promise<ProjectLaunchResult | undefined> {
  const input = await buildProjectLaunchInput(selectedSettings)
  let result: ProjectLaunchResult | undefined
  const createNode = () =>
    h(ProjectLaunchApp, {
      ...input,
      onSubmit: (value: ProjectLaunchResult) => {
        result = value
      },
      onCreateSubmit: async (saveAs: string, toggles: ProjectLaunchToggleState) => {
        try {
          await launchPresetService.createPreset(saveAs, launchResultToSettings({ toggles }))
          return null
        } catch (error) {
          const knownError = CliError.is(error, 'launch_preset_already_exists')
          if (knownError) return knownError
          throw error
        }
      }
    })
  const state = { resizeVersion: 0 }
  let app: RefreshableInkApp
  const onShortcut = (input: string, key: ShortcutKey) => {
    createGlobalShortcutHandler(app, createNode, process.stdout, state, onShortcut)(input, key)
  }
  app = render(wrapInkNode(createNode, state.resizeVersion, onShortcut))
  await waitForInkAppExit(app, createNode, process.stdout, state, onShortcut)
  return result
}

async function renderProjectManageApp(
  selectedSettings: SettingsSelectResult
): Promise<ProjectManageResult | undefined> {
  const input = await buildProjectLaunchInput(selectedSettings)
  let result: ProjectManageResult | undefined
  const createNode = () =>
    h(ProjectManageApp, {
      ...input,
      onSubmit: (value: ProjectManageResult) => {
        result = value
      },
      onSaveSubmit: async (presetName: string, toggles: ProjectLaunchToggleState) => {
        try {
          await launchPresetService.writePresetSettings(presetName, launchResultToSettings({ toggles }))
          return null
        } catch (error) {
          const knownError = CliError.is(error, 'launch_preset_not_found')
          if (knownError) return knownError
          throw error
        }
      },
      onCreateSubmit: async (saveAs: string, toggles: ProjectLaunchToggleState) => {
        try {
          await launchPresetService.createPreset(saveAs, launchResultToSettings({ toggles }))
          return null
        } catch (error) {
          const knownError = CliError.is(error, 'launch_preset_already_exists')
          if (knownError) return knownError
          throw error
        }
      },
      onRenameSubmit: async (presetName: string, newName: string) => {
        try {
          await launchPresetService.renamePreset(presetName, newName)
          return null
        } catch (error) {
          const knownError = CliError.is(error, 'launch_preset_already_exists')
          if (knownError) return knownError
          throw error
        }
      }
    })
  const state = { resizeVersion: 0 }
  let app: RefreshableInkApp
  const onShortcut = (input: string, key: ShortcutKey) => {
    createGlobalShortcutHandler(app, createNode, process.stdout, state, onShortcut)(input, key)
  }
  app = render(wrapInkNode(createNode, state.resizeVersion, onShortcut))
  await waitForInkAppExit(app, createNode, process.stdout, state, onShortcut)
  return result
}

function launchResultToSettings(result: { toggles: ProjectLaunchToggleState }): {
  enabledPlugins: Record<string, boolean>
  skillOverrides: ReturnType<typeof skillStatesToOverrides>
  deniedMcpServers: ReturnType<typeof mcpStatesToDeniedServers>
} {
  return {
    enabledPlugins: pluginStatesToEnabledPlugins(result.toggles.plugins),
    skillOverrides: skillStatesToOverrides(result.toggles.skills),
    deniedMcpServers: mcpStatesToDeniedServers(result.toggles.mcps)
  }
}

const EMPTY_TOGGLES: ProjectLaunchToggleState = { plugins: [], skills: [], mcps: [] }

const SETTINGS_FLAG_WARNING = '\x1b[31mWarning: ccsp ignores passthrough --settings because it manages that flag.\x1b[0m\n'

function warnIfSettingsRemoved(sanitized: { removedSettings?: boolean }): void {
  if (sanitized.removedSettings) {
    process.stderr.write(SETTINGS_FLAG_WARNING)
  }
}

function combinePresetLabel(runMode: RunMode, globalName: string, projectPresetName: string): string {
  if (runMode === 'global-only') return `${globalName}/Detected`
  return `${globalName}/${projectPresetName}`
}

function bindingPresetLabel(binding: SessionBinding): string {
  return binding.presetLabel ?? `${binding.globalName}/${binding.projectPresetName}`
}

async function renderManageApp(
  items: SettingsSelectResult[],
  settingsDisplayFormat: SettingsDisplayFormat
): Promise<ManageResult | undefined> {
  let result: ManageResult | undefined
  const createNode = () =>
    h(ManageApp, {
      items,
      displayFormat: settingsDisplayFormat,
      onSubmit: (value: ManageResult) => {
        result = value
      },
      onRenameSubmit: async (item: SettingsSelectResult, newName: string) => {
        try {
          await presetService.renamePreset(item.name, newName)
          return null
        } catch (error) {
          const knownError = CliError.is(error, 'preset_already_exists')
          if (knownError) return knownError
          throw error
        }
      }
    })
  const state = { resizeVersion: 0 }
  let app: RefreshableInkApp
  const onShortcut = (input: string, key: ShortcutKey) => {
    createGlobalShortcutHandler(app, createNode, process.stdout, state, onShortcut)(input, key)
  }
  app = render(wrapInkNode(createNode, state.resizeVersion, onShortcut))
  await waitForInkAppExit(app, createNode, process.stdout, state, onShortcut)
  return result
}

async function createPresetInteractive(): Promise<PresetMeta | undefined> {
  return renderCreateApp()
}

async function launchClaudeWithFinalizedSettings(input: {
  baseSettings: unknown
  globalName: string
  projectPresetName: string
  presetLabel: string
  toggles: ProjectLaunchToggleState
  launchSettings: unknown
  args: string[]
  statusLineEnabled?: boolean
}): Promise<void> {
  const session = resolveSessionLaunch(input.args)
  const stem = randomUUID()
  const claudeSources = await settingsSourceService.discoverSettingsSources()
  const statusLineEnabled = input.statusLineEnabled ?? (await ccspConfigService.read()).statusLineEnabled
  const settingsPath = await launchPresetService.writeTempSettings(
    await finalizeLaunchSettings(input.baseSettings, input.launchSettings, {
      presetLabel: input.presetLabel,
      toggles: input.toggles,
      context,
      claudeSources,
      stem,
      statusLineEnabled,
    }),
    stem,
  )

  const bindingInput = {
    globalName: input.globalName,
    projectPresetName: input.projectPresetName,
    presetLabel: input.presetLabel,
    baseSettings: input.baseSettings,
    launchSettings: input.launchSettings,
    toggles: input.toggles,
  }

  // When we already know the session id (explicit --session-id / --resume <uuid>),
  // record the binding upfront so the config is recoverable even if Claude is
  // killed before exit. Otherwise snapshot Claude's project dir and discover
  // the id post-spawn by diffing.
  const sessionSnapshot = session.sessionId ? undefined : await claudeSessionService.snapshot()
  if (session.sessionId) {
    await launchPresetService.writeSessionBinding({ sessionId: session.sessionId, ...bindingInput })
  }

  try {
    process.exitCode = await spawnClaude(settingsPath, session.args)
  } catch (error) {
    if (error instanceof CliError) {
      process.exitCode = error.exitCode
    }
    throw error
  } finally {
    await launchPresetService.cleanupTempScripts(stem)
    const sessionId = session.sessionId ?? (sessionSnapshot && (await claudeSessionService.findNewSessionId(sessionSnapshot)))
    if (sessionId) {
      if (!session.sessionId) {
        await launchPresetService.writeSessionBinding({ sessionId, ...bindingInput })
      }
      await launchPresetService.recordSessionExit(sessionId)
    }
  }
}

async function launchWithSelectedSettings(
  selectedSettings: SettingsSelectResult,
  rawClaudeArgs: string[],
  config?: CcspConfig,
  runMode: RunMode = 'both',
  globalLabelOverride?: string,
): Promise<'back' | 'done' | 'quit'> {
  const sanitized = sanitizeClaudeArgs(rawClaudeArgs)
  warnIfSettingsRemoved(sanitized)

  const launchResult = await renderProjectLaunchApp(selectedSettings)
  if (!launchResult) return 'quit'
  if (launchResult.type === 'back') {
    clearTerminalScreen()
    return 'back'
  }

  await applyLaunchDisableRemovals(launchResult.disableRemovals)

  const launchSettings = launchResultToSettings(launchResult)

  if (launchResult.type === 'launch' && launchResult.saveAs) {
    const saved = await launchPresetService.createPreset(launchResult.saveAs, launchSettings)
    await launchPresetService.writeLastUsed(saved.name)
  } else if (launchResult.type === 'launch' && launchResult.presetName) {
    await launchPresetService.writePresetSettings(launchResult.presetName, launchSettings)
    await launchPresetService.writeLastUsed(launchResult.presetName)
  }

  const projectPresetName = resolveProjectPresetName(launchResult)

  await launchClaudeWithFinalizedSettings({
    baseSettings: selectedSettings.settings,
    globalName: selectedSettings.name,
    projectPresetName,
    presetLabel: combinePresetLabel(
      runMode,
      globalLabelOverride ?? (runMode === 'project-only' ? '*Claude Official*' : selectedSettings.name),
      projectPresetName,
    ),
    toggles: launchResult.toggles,
    launchSettings,
    args: sanitized.args,
    ...(config ? { statusLineEnabled: config.statusLineEnabled } : {}),
  })
  return 'done'
}

async function launchGlobalOnly(
  selectedSettings: SettingsSelectResult,
  rawClaudeArgs: string[],
  config: CcspConfig,
): Promise<void> {
  const sanitized = sanitizeClaudeArgs(rawClaudeArgs)
  warnIfSettingsRemoved(sanitized)

  const { detected } = await buildProjectLaunchInput(selectedSettings)

  await launchClaudeWithFinalizedSettings({
    baseSettings: selectedSettings.settings,
    globalName: selectedSettings.name,
    projectPresetName: 'Detected',
    presetLabel: combinePresetLabel('global-only', selectedSettings.name, 'Detected'),
    toggles: detected,
    launchSettings: selectedSettings.settings,
    args: sanitized.args,
    statusLineEnabled: config.statusLineEnabled,
  })
}

async function runInteractive(rawClaudeArgs: string[], fallbackMode?: 'resume' | 'continue'): Promise<void> {
  printBanner()
  const config = await ccspConfigService.read()
  const launchArgs = fallbackMode === 'resume'
    ? ['--resume', ...rawClaudeArgs]
    : rawClaudeArgs

  if (config.runMode === 'project-only') {
    const selectedSettings = await resolveProjectManageBaseSettings()
    if (!selectedSettings) {
      process.stderr.write('No project settings sources found for project preset management.\n')
      return
    }
    await launchWithSelectedSettings(selectedSettings, launchArgs, config, 'project-only')
    return
  }

  while (true) {
    const selectedSettings = await resolveInteractiveBaseSettings(config)
    if (!selectedSettings) return

    if (config.runMode === 'global-only') {
      await launchGlobalOnly(selectedSettings, launchArgs, config)
      return
    }

    const outcome = await launchWithSelectedSettings(selectedSettings, launchArgs, config, 'both')
    if (outcome !== 'back') return
    printBanner()
  }
}

async function launchFromBinding(binding: SessionBinding, extraArgs: string[]): Promise<void> {
  const sanitized = sanitizeClaudeArgs(extraArgs)
  warnIfSettingsRemoved(sanitized)
  process.stderr.write(
    `\x1b[2mResuming ${bindingPresetLabel(binding)} (session ${binding.sessionId})\x1b[0m\n`,
  )
  const filteredArgs = sanitized.args.filter(
    (arg, index, args) =>
      arg !== '--continue' &&
      arg !== '-c' &&
      !arg.startsWith('--continue=') &&
      arg !== '--resume' &&
      arg !== '-r' &&
      !arg.startsWith('--resume=') &&
      arg !== '--session-id' &&
      !arg.startsWith('--session-id=') &&
      !((args[index - 1] === '--resume' || args[index - 1] === '-r' || args[index - 1] === '--session-id') &&
        !arg.startsWith('-')),
  )

  await launchClaudeWithFinalizedSettings({
    baseSettings: binding.baseSettings,
    globalName: binding.globalName,
    projectPresetName: binding.projectPresetName,
    presetLabel: bindingPresetLabel(binding),
    toggles: binding.toggles as unknown as ProjectLaunchToggleState,
    launchSettings: binding.launchSettings,
    args: ['--resume', binding.sessionId, ...filteredArgs],
  })
}

async function resolveLiveBinding(binding: SessionBinding | undefined): Promise<SessionBinding | undefined> {
  if (!binding) return undefined
  if (await claudeSessionService.hasSession(binding.sessionId)) return binding
  process.stderr.write(
    `\x1b[2mDiscarding stale binding (no Claude session for ${binding.sessionId}).\x1b[0m\n`,
  )
  await launchPresetService.deleteSessionBinding(binding.sessionId)
  return undefined
}

async function runResume(sessionId: string, extraArgs: string[]): Promise<void> {
  const binding = await resolveLiveBinding(await launchPresetService.readSessionBinding(sessionId))
  if (binding) {
    await launchFromBinding(binding, extraArgs)
    return
  }
  process.stderr.write(
    `\x1b[2mNo saved ccsp launch config for session ${sessionId}; pick a preset to resume with.\x1b[0m\n`,
  )
  await runInteractive([sessionId, ...extraArgs], 'resume')
}

async function runContinue(extraArgs: string[]): Promise<void> {
  // Walk newest-exited bindings until one points at a live Claude session.
  // resolveLiveBinding prunes stale entries, so each loop iteration makes progress.
  while (true) {
    const candidate = await launchPresetService.findLatestExitedSession()
    if (!candidate) break
    const live = await resolveLiveBinding(candidate)
    if (live) {
      await launchFromBinding(live, extraArgs)
      return
    }
  }
  process.stderr.write('\x1b[2mNo saved ccsp session to continue; pick a preset.\x1b[0m\n')
  await runInteractive(extraArgs)
}

async function manageInteractive(): Promise<void> {
  const config = await ccspConfigService.read()
  while (true) {
    const items = await buildGlobalSettingsPresetItems()
    const selection = await renderManageApp(items, config.settingsDisplayFormat)
    if (!selection || selection.type === 'exit') return

    if (selection.type === 'launch') {
      if (config.runMode === 'global-only') {
        await launchGlobalOnly(selection.item, [], config)
        return
      }

      const outcome = await launchWithSelectedSettings(
        selection.item,
        [],
        config,
        config.runMode,
        config.runMode === 'project-only' ? selection.item.name : undefined,
      )
      if (outcome === 'back') continue
      return
    }

    if (selection.type === 'rename') {
      await presetService.renamePreset(selection.item.name, selection.newName)
      continue
    }

    if (selection.type === 'create') {
      await createPresetInteractive()
      continue
    }

    if (selection.type === 'refresh') {
      continue
    }

    if (selection.type === 'delete') {
      await presetService.deletePreset(selection.item.name)
      continue
    }
  }
}

async function resolveDirectGlobalSettings(globalPreset: string): Promise<SettingsSelectResult> {
  if (globalPreset === CLAUDE_OFFICIAL_PRESET_NAME) {
    const official = await buildClaudeOfficialPresetItem()
    if (!official) throw new CliError(`Preset not found: ${globalPreset}`)
    return official
  }

  const index = await presetService.readIndex()
  const name = resolvePresetIndexKey(index.presets, globalPreset)
  if (!name) throw new CliError(`Preset not found: ${globalPreset}`)
  const meta = index.presets[name]!
  if (meta.type !== 'base') throw new CliError(`Preset not found: ${globalPreset}`)

  return {
    name: meta.name,
    sourcePath: await presetService.getPresetPath(meta.name),
    settings: await presetService.readPresetSettings(meta.name),
  }
}

async function resolveDirectGlobalSettingsFallback(): Promise<SettingsSelectResult> {
  const rememberedName = await globalLastSettingsService.readLastUsed(context.cwd)
  if (rememberedName) {
    try {
      return await resolveDirectGlobalSettings(rememberedName)
    } catch {
      // Ignore stale last-used entries and fall back to project settings.
    }
  }

  const projectBase = await resolveProjectManageBaseSettings()
  if (!projectBase) {
    throw new CliError('No project settings sources found for direct launch.')
  }
  return projectBase
}

async function buildGlobalPreviewItems(selectedName: string): Promise<{ items: SettingsSelectResult[]; cursor: number }> {
  const officialItem = await buildClaudeOfficialPresetItem()
  const items = [...(officialItem ? [officialItem] : []), ...(await buildGlobalSettingsPresetItems())]
  const cursor = items.findIndex(item => item.name.toLowerCase() === selectedName.toLowerCase())
  if (cursor < 0) throw new CliError(`Preset not found: ${selectedName}`)
  return { items, cursor }
}

async function resolveDirectProjectLaunch(
  selectedSettings: SettingsSelectResult,
  projectPreset?: string,
): Promise<{
  toggles: ProjectLaunchToggleState
  projectPresetName: string
  launchInput: Awaited<ReturnType<typeof buildProjectLaunchInput>>
}> {
  const launchInput = await buildProjectLaunchInput(selectedSettings)

  if (!projectPreset || projectPreset.toLowerCase() === 'detected') {
    return {
      toggles: launchInput.detected,
      projectPresetName: 'Detected',
      launchInput,
    }
  }

  const name = resolvePresetIndexKey(
    Object.fromEntries(launchInput.presets.map(preset => [preset.name, preset])),
    projectPreset,
  )
  const toggles = name ? launchInput.statesByPreset[name] : undefined
  if (!name || !toggles) {
    throw new CliError(`Launch preset not found: ${projectPreset}`, 1, 'launch_preset_not_found')
  }

  return {
    toggles,
    projectPresetName: name,
    launchInput,
  }
}

function resolveDirectClaudeArgs(remainingArgs: string[]): string[] {
  return remainingArgs[0] === 'claude' ? remainingArgs.slice(1) : remainingArgs
}

async function renderDirectRunPreview(input: {
  config: CcspConfig
  globalPreset?: string
  globalPreview?: { items: SettingsSelectResult[]; cursor: number }
  projectPreset?: string
  projectPresetName: string
  toggles: ProjectLaunchToggleState
  launchInput: Awaited<ReturnType<typeof buildProjectLaunchInput>>
}): Promise<void> {
  const global = input.globalPreset && input.globalPreview
    ? {
        ...input.globalPreview,
        envOnly: input.config.globalPresetEnvOnly,
        displayFormat: input.config.settingsDisplayFormat,
      }
    : undefined

  const project = input.projectPreset
    ? {
        presets: input.launchInput.presets,
        detected: input.launchInput.detected,
        statesByPreset: input.launchInput.statesByPreset,
        selectedPresetName: input.projectPresetName,
        toggles: input.toggles,
        disableLockSources: input.launchInput.disableLockSources,
      }
    : undefined

  const createNode = () => h(DirectRunPreviewApp, { ...(global ? { global } : {}), ...(project ? { project } : {}) })
  const app = render(createNode())
  await new Promise<void>(resolve => setImmediate(resolve))
  app.unmount()
}

function directRunPresetLabel(
  options: Pick<DirectRunOptions, 'globalPreset'>,
  globalName: string,
  projectPresetName: string,
): string {
  if (!options.globalPreset) return projectPresetName
  return combinePresetLabel('both', globalName, projectPresetName)
}

async function runDirect(options: DirectRunOptions): Promise<void> {
  const config = await ccspConfigService.read()
  const claudeArgs = resolveDirectClaudeArgs(options.remainingArgs)
  const sanitized = sanitizeClaudeArgs(claudeArgs)
  warnIfSettingsRemoved(sanitized)

  let selectedSettings: SettingsSelectResult
  let globalPreview: Awaited<ReturnType<typeof buildGlobalPreviewItems>> | undefined

  if (options.globalPreset) {
    if (options.dryRun) {
      globalPreview = await buildGlobalPreviewItems(options.globalPreset)
      selectedSettings = globalPreview.items[globalPreview.cursor]!
    } else {
      selectedSettings = await resolveDirectGlobalSettings(options.globalPreset)
    }
  } else {
    selectedSettings = await resolveDirectGlobalSettingsFallback()
  }

  const { toggles, projectPresetName, launchInput } = await resolveDirectProjectLaunch(
    selectedSettings,
    options.projectPreset,
  )
  const launchSettings = launchResultToSettings({ toggles })

  if (options.dryRun) {
    await renderDirectRunPreview({
      config,
      ...(options.globalPreset ? { globalPreset: options.globalPreset } : {}),
      ...(globalPreview ? { globalPreview } : {}),
      ...(options.projectPreset ? { projectPreset: options.projectPreset } : {}),
      projectPresetName,
      toggles,
      launchInput,
    })
    return
  }

  if (options.globalPreset) {
    await globalLastSettingsService.writeLastUsed(context.cwd, selectedSettings.name)
  }

  if (options.projectPreset && projectPresetName !== 'Detected') {
    await launchPresetService.writeLastUsed(projectPresetName)
  }

  await launchClaudeWithFinalizedSettings({
    baseSettings: selectedSettings.settings,
    globalName: selectedSettings.name,
    projectPresetName,
    presetLabel: directRunPresetLabel(options, selectedSettings.name, projectPresetName),
    toggles,
    launchSettings,
    args: sanitized.args,
    statusLineEnabled: config.statusLineEnabled,
  })
}

async function manageProjectInteractive(): Promise<void> {
  const selectedSettings = await resolveProjectManageBaseSettings()
  if (!selectedSettings) {
    process.stderr.write('No project settings sources found for project preset management.\n')
    return
  }

  while (true) {
    const result = await renderProjectManageApp(selectedSettings)
    if (!result) return

    if (result.type === 'refresh') {
      continue
    }

    if (result.type === 'launch') {
      await applyLaunchDisableRemovals(result.disableRemovals)

      const launchSettings = launchResultToSettings(result)

      if (result.presetName) {
        await launchPresetService.writePresetSettings(result.presetName, launchSettings)
        await launchPresetService.writeLastUsed(result.presetName)
      }

      const projectPresetName = resolveProjectPresetName(result)

      await launchClaudeWithFinalizedSettings({
        baseSettings: selectedSettings.settings,
        globalName: selectedSettings.name,
        projectPresetName,
        presetLabel: projectPresetName,
        toggles: result.toggles,
        launchSettings,
        args: [],
      })
      return
    }

    if (result.type === 'rename') {
      await launchPresetService.renamePreset(result.presetName, result.newName)
      continue
    }

    if (result.type === 'delete') {
      await launchPresetService.deletePreset(result.presetName)
      continue
    }

    if (result.type === 'save') {
      await applyLaunchDisableRemovals(result.disableRemovals)
      await launchPresetService.writePresetSettings(result.presetName, launchResultToSettings(result))
      continue
    }

    if (result.type === 'create') {
      await applyLaunchDisableRemovals(result.disableRemovals)
      await launchPresetService.createPreset(result.saveAs, launchResultToSettings(result))
      continue
    }
  }
}

function isDirectRunRoute(remainingArgs: string[]): boolean {
  const first = remainingArgs[0]
  return first === undefined || !isCcspCommanderSubcommand(first)
}

function buildProgramArgv(argv: string[], runArgs: string[]): string[] {
  return [argv[0] ?? 'node', argv[1] ?? 'cli', ...runArgs]
}

export async function main(argv = process.argv): Promise<void> {
  const args = argv.slice(2)
  if (args.length === 0) {
    await runInteractive([])
    return
  }

  if (args[0] === '--continue' || args[0] === '-c') {
    await runContinue(args.slice(1))
    return
  }

  if (args[0] === '--resume' || args[0] === '-r') {
    const id = args[1]
    if (id && isUuid(id)) {
      await runResume(id, args.slice(2))
      return
    }
    await runInteractive(args)
    return
  }

  if (args[0]?.startsWith('--resume=')) {
    const id = args[0].slice('--resume='.length)
    if (isUuid(id)) {
      await runResume(id, args.slice(1))
      return
    }
    await runInteractive(args)
    return
  }

  const directOptions = parseDirectRunOptions(args)
  if (directOptions.isDirectRun && isDirectRunRoute(directOptions.remainingArgs)) {
    await runDirect(directOptions)
    return
  }

  const runArgs = directOptions.remainingArgs
  if (runArgs.length === 0) {
    await runInteractive([])
    return
  }

  if (runArgs[0] === 'claude') {
    const claudeArgs = runArgs.slice(1)
    if (claudeArgs[0] === '--continue' || claudeArgs[0] === '-c') {
      await runContinue(claudeArgs.slice(1))
      return
    }
    if (claudeArgs[0] === '--resume' || claudeArgs[0] === '-r') {
      const id = claudeArgs[1]
      if (id && isUuid(id)) {
        await runResume(id, claudeArgs.slice(2))
        return
      }
    }
    if (claudeArgs[0]?.startsWith('--resume=')) {
      const id = claudeArgs[0].slice('--resume='.length)
      if (isUuid(id)) {
        await runResume(id, claudeArgs.slice(1))
        return
      }
    }
    await runInteractive(claudeArgs)
    return
  }

  await createProgram().parseAsync(buildProgramArgv(argv, runArgs))
}

export function isCliDirectExecution(argv: string[], moduleUrl: string | URL = import.meta.url): boolean {
  const entry = argv[1]
  if (!entry) return false

  const scriptPath = fileURLToPath(moduleUrl)
  try {
    return realpathSync(entry) === realpathSync(scriptPath)
  } catch {
    return entry === scriptPath
  }
}

if (isCliDirectExecution(process.argv)) {
  main().catch(error => {
    if (error instanceof CliError) {
      process.stderr.write(`\nError: ${error.message}\n`)
      process.exitCode = error.exitCode
      return
    }

    throw error
  })
}
