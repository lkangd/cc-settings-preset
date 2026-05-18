#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import React from 'react'
import { Command } from 'commander'
import { render } from 'ink'

import { sanitizeClaudeArgs } from './core/args.js'
import { CliError } from './core/errors.js'
import { readJsonFile } from './core/json.js'
import { createPathContext, resolveGlobalRoot } from './core/paths.js'
import { parseSettings, type PresetMeta } from './core/schema.js'
import { spawnClaude } from './core/spawn.js'
import { CreateApp, type CreateResult } from './ink/create-app.js'
import { ManageApp, type ManageResult } from './ink/manage-app.js'
import { RunApp, type RunResult } from './ink/run-app.js'
import { pluginStatesToEnabledPlugins, resolvePluginStates, type PluginState } from './services/plugin-service.js'
import { createPresetService } from './services/preset-service.js'
import { createSettingsSourceService, type SettingsSource } from './services/settings-source-service.js'
import { applySkillOverrides, discoverSkillStates, skillStatesToOverrides, type SkillState } from './services/skill-service.js'

const h = React.createElement
const VERSION = '1.0.0'

const context = createPathContext()
const globalRoot = resolveGlobalRoot(context.homeDir)
const presetService = createPresetService(globalRoot)
const settingsSourceService = createSettingsSourceService(context)

export function createProgram(): Command {
  const program = new Command()
  program
    .name('cc-settings-preset')
    .description('Select Claude Code runtime settings presets')
    .version(VERSION)

  program
    .command('create')
    .description('Create a first-level settings preset')
    .action(async () => {
      await createPresetInteractive()
    })

  program
    .command('manage')
    .description('Manage settings presets')
    .action(async () => {
      await manageInteractive()
    })

  return program
}

async function renderCreateApp(): Promise<CreateResult | undefined> {
  const sources = (await settingsSourceService.discoverSettingsSources()).map(source => ({
    label: source.scope,
    filePath: source.filePath,
  }))
  let result: CreateResult | undefined
  const app = render(h(CreateApp, { sources, onSubmit: (value: CreateResult) => { result = value } }))
  await app.waitUntilExit()
  return result
}

async function resolveStatesByPreset(
  presets: PresetMeta[],
  sources: SettingsSource[],
): Promise<{
  pluginsByPreset: Record<string, PluginState[]>
  skillsByPreset: Record<string, SkillState[]>
}> {
  const pluginsByPreset: Record<string, PluginState[]> = {}
  const skillsByPreset: Record<string, SkillState[]> = {}

  for (const preset of presets) {
    const presetSettings = await presetService.readPresetSettings(preset.name)
    const plugins = resolvePluginStates([...sources, { scope: 'preset', filePath: preset.name, settings: presetSettings }])
    const discoveredSkills = await discoverSkillStates({
      homeDir: context.homeDir,
      cwd: context.cwd,
      enabledPlugins: pluginStatesToEnabledPlugins(plugins),
    })

    pluginsByPreset[preset.name] = plugins
    skillsByPreset[preset.name] = applySkillOverrides(discoveredSkills, presetSettings.skillOverrides)
  }

  return { pluginsByPreset, skillsByPreset }
}

async function renderRunApp(presets: PresetMeta[]): Promise<RunResult | undefined> {
  const sources = await settingsSourceService.discoverSettingsSources()
  const { pluginsByPreset, skillsByPreset } = await resolveStatesByPreset(presets, sources)

  let result: RunResult | undefined
  const app = render(h(RunApp, { presets, pluginsByPreset, skillsByPreset, onSubmit: (value: RunResult) => { result = value } }))
  await app.waitUntilExit()
  return result
}

async function renderManageApp(presets: PresetMeta[]): Promise<ManageResult | undefined> {
  const sources = await settingsSourceService.discoverSettingsSources()
  const { pluginsByPreset, skillsByPreset } = await resolveStatesByPreset(presets, sources)

  let result: ManageResult | undefined
  const app = render(h(ManageApp, { presets, pluginsByPreset, skillsByPreset, onSubmit: (value: ManageResult) => { result = value } }))
  await app.waitUntilExit()
  return result
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
  const sanitized = sanitizeClaudeArgs(rawClaudeArgs)
  if (sanitized.removedSettings) {
    process.stderr.write('\x1b[31mWarning: ccsp ignores passthrough --settings because it manages that flag.\x1b[0m\n')
  }

  let presets = await presetService.listPresets()
  if (presets.filter(preset => preset.type === 'base').length === 0) {
    const created = await createPresetInteractive()
    if (!created) return
    presets = await presetService.listPresets()
  }

  const selection = await renderRunApp(presets)
  if (!selection) return

  for (const [presetName, draft] of Object.entries(selection.draftsByPreset)) {
    const preset = presets.find(candidate => candidate.name === presetName)
    if (!preset || preset.type !== 'derived') continue
    await presetService.writePresetSettingsByName(preset.name, {
      enabledPlugins: pluginStatesToEnabledPlugins(draft.plugins),
      skillOverrides: skillStatesToOverrides(draft.skills),
    })
  }

  if (selection.type === 'derive') {
    const toggles = {
      enabledPlugins: pluginStatesToEnabledPlugins(selection.plugins),
      skillOverrides: skillStatesToOverrides(selection.skills),
    }
    const parentName = selection.preset.type === 'base' ? selection.preset.name : selection.preset.parentName
    const existing = await presetService.findMatchingDerivedPreset(parentName, toggles)
    const derived = existing ?? await presetService.createDerivedPreset(parentName, selection.derivedName ?? '', toggles)
    await launchPreset(derived, sanitized.args)
    return
  }

  await launchPreset(selection.preset, sanitized.args)
}

async function manageInteractive(): Promise<void> {
  while (true) {
    const presets = await presetService.listPresets()
    const selection = await renderManageApp(presets)
    if (!selection || selection.type === 'exit') return

    if (selection.type === 'launch') {
      await launchPreset(selection.preset, [])
      return
    }

    if (selection.type === 'rename') {
      await presetService.renamePreset(selection.preset.name, selection.newName)
      continue
    }

    if (selection.type === 'delete') {
      await presetService.deletePreset(selection.preset.name)
      continue
    }
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
