#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import React from 'react'
import { Command } from 'commander'
import { render } from 'ink'
import figlet from 'figlet'
import gradient from 'gradient-string'

import { sanitizeClaudeArgs } from './core/args.js'
import { CliError } from './core/errors.js'
import { readJsonFile } from './core/json.js'
import { createPathContext, resolveGlobalRoot } from './core/paths.js'
import { parseSettings, type PresetMeta } from './core/schema.js'
import { spawnClaude } from './core/spawn.js'
import { CreateApp, type CreateResult } from './ink/create-app.js'
import type { ProjectLaunchToggleState } from './flows/project-launch-flow.js'
import { ManageApp, type ManageResult } from './ink/manage-app.js'
import { ProjectLaunchApp, type ProjectLaunchResult } from './ink/project-launch-app.js'
import { SettingsSelectApp, type SettingsSelectResult } from './ink/settings-select-app.js'
import {
  applyPluginOverrides,
  forceEnablePlugins,
  pluginStatesToEnabledPlugins,
  resolvePluginStates,
  type PluginState
} from './services/plugin-service.js'
import { createLaunchPresetService } from './services/launch-preset-service.js'
import { applyDeniedMcpServers, discoverMcpStates, mcpStatesToDeniedServers, type McpState } from './services/mcp-service.js'
import { createPresetService } from './services/preset-service.js'
import { createSettingsSourceService, type SettingsSource } from './services/settings-source-service.js'
import { finalizeSettings } from './services/settings-finalizer-service.js'
import {
  applySkillOverrides,
  discoverSkillStates,
  forceEnableSkills,
  skillStatesToOverrides,
  type SkillState
} from './services/skill-service.js'

const h = React.createElement
const VERSION = '1.0.0'

const context = createPathContext()
const globalRoot = resolveGlobalRoot(context.homeDir)
const presetService = createPresetService(globalRoot)
const settingsSourceService = createSettingsSourceService(context)
const launchPresetService = createLaunchPresetService(context.cwd)

export function createProgram(): Command {
  const program = new Command()
  program.name('cc-settings-preset').description('Select Claude Code runtime settings presets').version(VERSION)

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
    .action(async () => {
      printBanner()
      await manageInteractive()
    })

  return program
}

export function printBanner() {
  const banner = figlet.textSync('C C S P', { font: 'ANSI Shadow' })
  const line = '─'.repeat(48)
  const styled = gradient(['#00d2ff', '#7b2ff7', '#ff0080'])(banner)
  process.stderr.write(`\n${styled}\x1b[2m\n${line}\x1b[0m\n\n`)
}

async function renderCreateApp(): Promise<CreateResult | undefined> {
  const sources = (await settingsSourceService.discoverSettingsSources()).map(source => ({
    label: source.scope,
    filePath: source.filePath
  }))
  let result: CreateResult | undefined
  const app = render(
    h(CreateApp, {
      sources,
      onSubmit: (value: CreateResult) => {
        result = value
      }
    })
  )
  await app.waitUntilExit()
  return result
}

async function resolveStatesByPreset(
  presets: PresetMeta[],
  sources: SettingsSource[]
): Promise<{
  pluginsByPreset: Record<string, PluginState[]>
  skillsByPreset: Record<string, SkillState[]>
}> {
  const pluginsByPreset: Record<string, PluginState[]> = {}
  const skillsByPreset: Record<string, SkillState[]> = {}

  for (const preset of presets) {
    const presetSettings = await presetService.readPresetSettings(preset.name)
    const plugins = resolvePluginStates([
      ...sources,
      { scope: 'preset', filePath: preset.name, settings: presetSettings }
    ])
    const discoveredSkills = await discoverSkillStates({
      homeDir: context.homeDir,
      cwd: context.cwd,
      enabledPlugins: pluginStatesToEnabledPlugins(plugins)
    })

    pluginsByPreset[preset.name] = plugins
    skillsByPreset[preset.name] = applySkillOverrides(discoveredSkills, presetSettings.skillOverrides)
  }

  return { pluginsByPreset, skillsByPreset }
}

async function renderSettingsSelectApp(
  items: SettingsSelectResult[],
  initialName?: string,
): Promise<SettingsSelectResult | undefined> {
  let result: SettingsSelectResult | undefined
  const app = render(
    h(SettingsSelectApp, {
      items,
      ...(initialName ? { initialName } : {}),
      onSubmit: (value: SettingsSelectResult) => {
        result = value
      },
    })
  )
  await app.waitUntilExit()
  return result
}

async function buildSettingsSelectItems(): Promise<SettingsSelectResult[]> {
  const presets = (await presetService.listPresets()).filter(preset => preset.type === 'base')
  if (presets.length > 0) {
    const items: SettingsSelectResult[] = []
    for (const preset of presets) {
      items.push({
        name: preset.name,
        sourcePath: await presetService.getPresetPath(preset.name),
        settings: await presetService.readPresetSettings(preset.name),
      })
    }
    return items
  }

  const sources = await settingsSourceService.discoverSettingsSources()
  return sources.map(source => ({
    name: source.scope,
    sourcePath: source.filePath,
    settings: source.settings,
    temporary: true,
  }))
}

async function buildProjectLaunchInput(selectedSettings: SettingsSelectResult): Promise<{
  presets: Awaited<ReturnType<typeof launchPresetService.listPresets>>
  detected: ProjectLaunchToggleState
  statesByPreset: Record<string, ProjectLaunchToggleState>
  lastUsedName?: string
}> {
  const sources = await settingsSourceService.discoverSettingsSources()
  const basePlugins = forceEnablePlugins(resolvePluginStates([
    ...sources,
    { scope: 'preset', filePath: selectedSettings.sourcePath, settings: selectedSettings.settings },
  ]))
  const baseSkills = forceEnableSkills(await discoverSkillStates({
    homeDir: context.homeDir,
    cwd: context.cwd,
    enabledPlugins: pluginStatesToEnabledPlugins(basePlugins),
  }))
  const baseMcps = await discoverMcpStates({ homeDir: context.homeDir, cwd: context.cwd })
  const launchPresets = await launchPresetService.listPresets()
  const statesByPreset: Record<string, ProjectLaunchToggleState> = {}

  for (const preset of launchPresets) {
    const settings = await launchPresetService.readPresetSettings(preset.name)
    statesByPreset[preset.name] = {
      plugins: applyPluginOverrides(basePlugins, settings.enabledPlugins),
      skills: applySkillOverrides(baseSkills, settings.skillOverrides),
      mcps: applyDeniedMcpServers(baseMcps, settings.deniedMcpServers),
    }
  }

  const lastUsedName = await launchPresetService.readLastUsed()
  return {
    presets: launchPresets,
    detected: { plugins: basePlugins, skills: baseSkills, mcps: baseMcps },
    statesByPreset,
    ...(lastUsedName ? { lastUsedName } : {}),
  }
}

async function renderProjectLaunchApp(selectedSettings: SettingsSelectResult): Promise<ProjectLaunchResult | undefined> {
  const input = await buildProjectLaunchInput(selectedSettings)
  let result: ProjectLaunchResult | undefined
  const app = render(
    h(ProjectLaunchApp, {
      ...input,
      onSubmit: (value: ProjectLaunchResult) => {
        result = value
      },
    })
  )
  await app.waitUntilExit()
  return result
}

function launchResultToSettings(result: ProjectLaunchResult): {
  enabledPlugins: Record<string, boolean>
  skillOverrides: ReturnType<typeof skillStatesToOverrides>
  deniedMcpServers: ReturnType<typeof mcpStatesToDeniedServers>
} {
  return {
    enabledPlugins: pluginStatesToEnabledPlugins(result.toggles.plugins),
    skillOverrides: skillStatesToOverrides(result.toggles.skills),
    deniedMcpServers: mcpStatesToDeniedServers(result.toggles.mcps),
  }
}

type ManageInitialState = React.ComponentProps<typeof ManageApp>['initialState']

async function renderManageApp(
  presets: PresetMeta[],
  initialState?: ManageInitialState,
): Promise<ManageResult[]> {
  const sources = await settingsSourceService.discoverSettingsSources()
  const { pluginsByPreset, skillsByPreset } = await resolveStatesByPreset(presets, sources)

  const results: ManageResult[] = []
  const app = render(
    h(ManageApp, {
      presets,
      pluginsByPreset,
      skillsByPreset,
      ...(initialState ? { initialState } : {}),
      onSubmit: (value: ManageResult) => {
        results.push(value)
      },
      onRenameSubmit: async (preset: PresetMeta, newName: string) => {
        try {
          await presetService.renamePreset(preset.name, newName)
          return null
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('Preset already exists: ')) {
            return error.message
          }

          throw error
        }
      }
    })
  )
  await app.waitUntilExit()
  return results
}

async function createPresetInteractive(): Promise<PresetMeta | undefined> {
  const selection = await renderCreateApp()
  if (!selection) return undefined

  const settings = parseSettings(await readJsonFile(selection.sourcePath))
  return presetService.createBasePreset(selection.name, settings)
}

async function launchPreset(preset: PresetMeta, claudeArgs: string[]): Promise<void> {
  const finalPreset = preset.type === 'derived' ? await presetService.syncDerivedPreset(preset.name) : preset
  const settingsPath = await presetService.getPresetPath(finalPreset.name)
  const code = await spawnClaude(settingsPath, claudeArgs)
  process.exitCode = code
}

async function runInteractive(rawClaudeArgs: string[]): Promise<void> {
  printBanner()
  const sanitized = sanitizeClaudeArgs(rawClaudeArgs)
  if (sanitized.removedSettings) {
    process.stderr.write('\x1b[31mWarning: ccsp ignores passthrough --settings because it manages that flag.\x1b[0m\n')
  }

  let settingsItems = await buildSettingsSelectItems()
  if (settingsItems.length === 0) {
    const created = await createPresetInteractive()
    if (!created) return
    settingsItems = await buildSettingsSelectItems()
  }

  const selectedSettings = await renderSettingsSelectApp(settingsItems)
  if (!selectedSettings) return

  const launchResult = await renderProjectLaunchApp(selectedSettings)
  if (!launchResult) return

  const launchSettings = launchResultToSettings(launchResult)

  if (launchResult.type === 'launch' && launchResult.saveAs) {
    const saved = await launchPresetService.createPreset(launchResult.saveAs, launchSettings)
    await launchPresetService.writeLastUsed(saved.name)
  } else if (launchResult.type === 'launch' && launchResult.presetName) {
    await launchPresetService.writeLastUsed(launchResult.presetName)
  }

  const settingsPath = await launchPresetService.writeTempSettings(finalizeSettings(selectedSettings.settings, launchSettings))
  const code = await spawnClaude(settingsPath, sanitized.args)
  process.exitCode = code
}

async function manageInteractive(): Promise<void> {
  while (true) {
    const presets = await presetService.listPresets()
    const selections = await renderManageApp(presets)
    if (selections.length === 0) return

    let shouldRerender = false

    for (const selection of selections) {
      if (selection.type === 'exit') return

      if (selection.type === 'save') {
        await presetService.writePresetSettingsByName(selection.preset.name, {
          enabledPlugins: pluginStatesToEnabledPlugins(selection.plugins),
          skillOverrides: skillStatesToOverrides(selection.skills)
        })
        shouldRerender = true
        continue
      }

      if (selection.type === 'launch') {
        await launchPreset(selection.preset, [])
        return
      }

      if (selection.type === 'refresh') {
        shouldRerender = true
        break
      }

      if (selection.type === 'delete') {
        await presetService.deletePreset(selection.preset.name)
        shouldRerender = true
        break
      }
    }

    if (!shouldRerender) return
  }
}

export async function main(argv = process.argv): Promise<void> {
  const args = argv.slice(2)
  if (args.length === 0) {
    await runInteractive([])
    return
  }

  if (args[0] === 'claude') {
    await runInteractive(args.slice(1))
    return
  }

  await createProgram().parseAsync(argv)
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url)

if (isDirectExecution) {
  main().catch(error => {
    if (error instanceof CliError) {
      process.stderr.write(`\nError: ${error.message}\n`)
      process.exitCode = error.exitCode
      return
    }

    throw error
  })
}
