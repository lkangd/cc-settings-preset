import type { BasePresetMeta } from '../core/schema.js'
import { sortPluginStates, type PluginState } from '../services/plugin-service.js'
import { sortSkillStatesByStatus, type SkillState } from '../services/skill-service.js'

export type RunFlowFocus = 'settings' | 'plugins' | 'skills'

export type RunFlowSortMode = 'status' | 'name'

export type RunFlowDraft = {
  plugins: PluginState[]
  skills: SkillState[]
}

export type RunFlowState = {
  presets: BasePresetMeta[]
  plugins: PluginState[]
  skills: SkillState[]
  pluginsByPreset: Record<string, PluginState[]>
  skillsByPreset: Record<string, SkillState[]>
  draftsByPreset: Record<string, RunFlowDraft>
  focus: RunFlowFocus
  settingsCursor: number
  pluginCursor: number
  skillCursor: number
  dirty: boolean
  sortMode: RunFlowSortMode
}

export type RunFlowEvent =
  | { type: 'focus-plugins' }
  | { type: 'focus-skills' }
  | { type: 'focus-left' }
  | { type: 'focus-right' }
  | { type: 'escape' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'toggle-current' }
  | { type: 'toggle-sort-mode' }

export function createRunFlowState(input: {
  presets: BasePresetMeta[]
  plugins?: PluginState[]
  skills?: SkillState[]
  pluginsByPreset?: Record<string, PluginState[]>
  skillsByPreset?: Record<string, SkillState[]>
}): RunFlowState {
  const firstPreset = input.presets[0]?.name
  const pluginsByPreset = input.pluginsByPreset ?? {}
  const skillsByPreset = input.skillsByPreset ?? {}
  const draftsByPreset: Record<string, RunFlowDraft> = {}
  const plugins = input.plugins ?? (firstPreset ? (pluginsByPreset[firstPreset] ?? []) : [])
  const skills = input.skills ?? (firstPreset ? (skillsByPreset[firstPreset] ?? []) : [])

  return {
    presets: input.presets,
    plugins,
    skills,
    pluginsByPreset,
    skillsByPreset,
    draftsByPreset,
    focus: 'settings',
    settingsCursor: 0,
    pluginCursor: 0,
    skillCursor: 0,
    dirty: false,
    sortMode: 'status',
  }
}

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(value, Math.max(0, length - 1)))
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

function getOrderedFocuses(_state: RunFlowState): RunFlowFocus[] {
  return ['settings', 'plugins', 'skills']
}

function activePresetName(state: RunFlowState): string | undefined {
  return state.presets[state.settingsCursor]?.name
}

function activePreset(state: RunFlowState): BasePresetMeta | undefined {
  return state.presets[state.settingsCursor]
}

function getPresetPlugins(state: RunFlowState): PluginState[] {
  const presetName = activePresetName(state)
  if (!presetName) return []
  return state.draftsByPreset[presetName]?.plugins ?? state.pluginsByPreset[presetName] ?? []
}

function getPresetSkills(state: RunFlowState): SkillState[] {
  const presetName = activePresetName(state)
  if (!presetName) return []
  return state.draftsByPreset[presetName]?.skills ?? state.skillsByPreset[presetName] ?? []
}

function sortPluginsForMode(plugins: PluginState[], sortMode: RunFlowSortMode): PluginState[] {
  return sortMode === 'status' ? sortPluginStates(plugins) : sortByName(plugins)
}

function sortSkillsForMode(skills: SkillState[], sortMode: RunFlowSortMode): SkillState[] {
  return sortMode === 'status' ? sortSkillStatesByStatus(skills) : sortByName(skills)
}

function syncResolvedState(state: RunFlowState): RunFlowState {
  const plugins = sortPluginsForMode(getPresetPlugins(state), state.sortMode)
  const skills = sortSkillsForMode(getPresetSkills(state), state.sortMode)

  return {
    ...state,
    plugins,
    skills,
    pluginCursor: clamp(state.pluginCursor, plugins.length),
    skillCursor: clamp(state.skillCursor, skills.length),
  }
}

function moveFocus(state: RunFlowState, direction: -1 | 1): RunFlowState {
  const focuses = getOrderedFocuses(state)
  const index = focuses.indexOf(state.focus)
  if (index === -1) return state
  const nextFocus = focuses[clamp(index + direction, focuses.length)]
  return nextFocus ? { ...state, focus: nextFocus } : state
}

export function shouldShowDerivedHint(state: RunFlowState): boolean {
  const preset = activePreset(state)
  if (!preset) return false
  return Boolean(state.draftsByPreset[preset.name])
}

export function reduceRunFlow(state: RunFlowState, event: RunFlowEvent): RunFlowState {
  if (event.type === 'focus-plugins') return { ...state, focus: 'plugins' }
  if (event.type === 'focus-skills') return { ...state, focus: 'skills' }
  if (event.type === 'focus-left') return moveFocus(state, -1)
  if (event.type === 'focus-right') return moveFocus(state, 1)
  if (event.type === 'escape') return { ...state, focus: 'settings' }

  if (event.type === 'up') {
    if (state.focus === 'plugins') return { ...state, pluginCursor: clamp(state.pluginCursor - 1, state.plugins.length) }
    if (state.focus === 'skills') return { ...state, skillCursor: clamp(state.skillCursor - 1, state.skills.length) }
    return syncResolvedState({ ...state, settingsCursor: clamp(state.settingsCursor - 1, state.presets.length) })
  }

  if (event.type === 'down') {
    if (state.focus === 'plugins') return { ...state, pluginCursor: clamp(state.pluginCursor + 1, state.plugins.length) }
    if (state.focus === 'skills') return { ...state, skillCursor: clamp(state.skillCursor + 1, state.skills.length) }
    return syncResolvedState({ ...state, settingsCursor: clamp(state.settingsCursor + 1, state.presets.length) })
  }

  if (event.type === 'toggle-sort-mode') {
    const sortMode = state.sortMode === 'status' ? 'name' : 'status'
    return {
      ...state,
      sortMode,
      plugins: sortPluginsForMode(state.plugins, sortMode),
      skills: sortSkillsForMode(state.skills, sortMode),
      pluginCursor: clamp(state.pluginCursor, state.plugins.length),
      skillCursor: clamp(state.skillCursor, state.skills.length),
    }
  }

  if (event.type === 'toggle-current') {
    if (state.focus === 'plugins') {
      const presetName = activePresetName(state)
      if (!presetName) return state
      const plugins = state.plugins.map((plugin, index) => index === state.pluginCursor ? { ...plugin, enabled: !plugin.enabled } : plugin)
      return {
        ...state,
        plugins: sortPluginsForMode(plugins, state.sortMode),
        draftsByPreset: {
          ...state.draftsByPreset,
          [presetName]: {
            plugins: sortPluginsForMode(plugins, state.sortMode),
            skills: getPresetSkills(state),
          },
        },
        dirty: true,
      }
    }

    if (state.focus === 'skills') {
      const current = state.skills[state.skillCursor]
      if (!current?.toggleable) return state
      const presetName = activePresetName(state)
      if (!presetName) return state
      const skills = state.skills.map((skill, index) => index === state.skillCursor ? { ...skill, enabled: !skill.enabled } : skill)
      return {
        ...state,
        skills: sortSkillsForMode(skills, state.sortMode),
        draftsByPreset: {
          ...state.draftsByPreset,
          [presetName]: {
            plugins: getPresetPlugins(state),
            skills: sortSkillsForMode(skills, state.sortMode),
          },
        },
        dirty: true,
      }
    }
  }

  return state
}
