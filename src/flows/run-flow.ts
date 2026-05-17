import type { PresetMeta } from '../core/schema.js'
import type { PluginState } from '../services/plugin-service.js'
import type { SkillState } from '../services/skill-service.js'

export type RunFlowFocus = 'settings' | 'plugins' | 'skills' | 'derived'

export type RunFlowState = {
  presets: PresetMeta[]
  plugins: PluginState[]
  skills: SkillState[]
  focus: RunFlowFocus
  settingsCursor: number
  pluginCursor: number
  skillCursor: number
  derivedCursor: number
  dirty: boolean
}

export type RunFlowEvent =
  | { type: 'focus-plugins' }
  | { type: 'focus-skills' }
  | { type: 'escape' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'toggle-current' }

export function createRunFlowState(input: {
  presets: PresetMeta[]
  plugins: PluginState[]
  skills: SkillState[]
}): RunFlowState {
  return {
    presets: input.presets,
    plugins: input.plugins,
    skills: input.skills,
    focus: 'settings',
    settingsCursor: 0,
    pluginCursor: 0,
    skillCursor: 0,
    derivedCursor: 0,
    dirty: false,
  }
}

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(value, Math.max(0, length - 1)))
}

export function reduceRunFlow(state: RunFlowState, event: RunFlowEvent): RunFlowState {
  if (event.type === 'focus-plugins') return { ...state, focus: 'plugins' }
  if (event.type === 'focus-skills') return { ...state, focus: 'skills' }
  if (event.type === 'escape') return { ...state, focus: 'settings' }

  if (event.type === 'up') {
    if (state.focus === 'plugins') return { ...state, pluginCursor: clamp(state.pluginCursor - 1, state.plugins.length) }
    if (state.focus === 'skills') return { ...state, skillCursor: clamp(state.skillCursor - 1, state.skills.length) }
    if (state.focus === 'derived') return { ...state, derivedCursor: clamp(state.derivedCursor - 1, state.presets.length) }
    return { ...state, settingsCursor: clamp(state.settingsCursor - 1, state.presets.length) }
  }

  if (event.type === 'down') {
    if (state.focus === 'plugins') return { ...state, pluginCursor: clamp(state.pluginCursor + 1, state.plugins.length) }
    if (state.focus === 'skills') return { ...state, skillCursor: clamp(state.skillCursor + 1, state.skills.length) }
    if (state.focus === 'derived') return { ...state, derivedCursor: clamp(state.derivedCursor + 1, state.presets.length) }
    return { ...state, settingsCursor: clamp(state.settingsCursor + 1, state.presets.length) }
  }

  if (event.type === 'toggle-current') {
    if (state.focus === 'plugins') {
      const plugins = state.plugins.map((plugin, index) => index === state.pluginCursor ? { ...plugin, enabled: !plugin.enabled } : plugin)
      return { ...state, plugins, dirty: true }
    }

    if (state.focus === 'skills') {
      const current = state.skills[state.skillCursor]
      if (!current?.toggleable) return state
      const skills = state.skills.map((skill, index) => index === state.skillCursor ? { ...skill, enabled: !skill.enabled } : skill)
      return { ...state, skills, dirty: true }
    }
  }

  return state
}
