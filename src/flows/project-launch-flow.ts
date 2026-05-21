import type { LaunchPresetMeta } from '../core/schema.js'
import { sortPluginStates, type PluginState } from '../services/plugin-service.js'
import { sortSkillStatesByStatus, type SkillState } from '../services/skill-service.js'
import type { McpState } from '../services/mcp-service.js'

export type ProjectLaunchFocus = 'presets' | 'plugins' | 'skills' | 'mcps'
export type ProjectLaunchSortMode = 'status' | 'name'

export type ProjectLaunchToggleState = {
  plugins: PluginState[]
  skills: SkillState[]
  mcps: McpState[]
}

export type ProjectLaunchPresetItem =
  | { type: 'detected'; name: 'Detected' }
  | { type: 'preset'; name: string; preset: LaunchPresetMeta }

export type ProjectLaunchFlowState = ProjectLaunchToggleState & {
  presetItems: ProjectLaunchPresetItem[]
  statesByPreset: Record<string, ProjectLaunchToggleState>
  draftsByPreset: Record<string, ProjectLaunchToggleState>
  focus: ProjectLaunchFocus
  presetCursor: number
  pluginCursor: number
  skillCursor: number
  mcpCursor: number
  dirty: boolean
  sortMode: ProjectLaunchSortMode
  toggleMessage?: string
}

export type ToggleColumnItem = {
  name: string
  enabled: boolean
  source: PluginState['source'] | SkillState['source'] | McpState['source']
  toggleable?: boolean
  enableLocked?: boolean
}

export type ProjectLaunchFlowEvent =
  | { type: 'focus-presets' }
  | { type: 'focus-plugins' }
  | { type: 'focus-skills' }
  | { type: 'focus-mcps' }
  | { type: 'focus-left' }
  | { type: 'focus-right' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'toggle-current' }
  | { type: 'toggle-sort-mode' }

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(value, Math.max(0, length - 1)))
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

function sortMcps(states: McpState[], sortMode: ProjectLaunchSortMode): McpState[] {
  if (sortMode === 'name') return sortByName(states)
  return [...states].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function sortPlugins(states: PluginState[], sortMode: ProjectLaunchSortMode): PluginState[] {
  return sortMode === 'name' ? sortByName(states) : sortPluginStates(states)
}

function sortSkills(states: SkillState[], sortMode: ProjectLaunchSortMode): SkillState[] {
  return sortMode === 'name' ? sortByName(states) : sortSkillStatesByStatus(states)
}

function isPinnedToBottom(
  detected: ProjectLaunchToggleState,
  kind: 'plugins' | 'skills' | 'mcps',
  item: { name: string; enabled: boolean },
): boolean {
  return isEnableLocked(detected, kind, item.name) && !item.enabled
}

function sortWithPinnedBottom<T extends { name: string; enabled: boolean }>(
  items: T[],
  detected: ProjectLaunchToggleState,
  kind: 'plugins' | 'skills' | 'mcps',
  sortRegular: (regular: T[]) => T[],
): T[] {
  const pinned: T[] = []
  const regular: T[] = []

  for (const item of items) {
    if (isPinnedToBottom(detected, kind, item)) pinned.push(item)
    else regular.push(item)
  }

  return [...sortRegular(regular), ...sortByName(pinned)]
}

function activeItem(state: ProjectLaunchFlowState): ProjectLaunchPresetItem | undefined {
  return state.presetItems[state.presetCursor]
}

function activeKey(state: ProjectLaunchFlowState): string {
  const item = activeItem(state)
  return item?.type === 'preset' ? item.name : 'Detected'
}

function detectedBaseline(state: ProjectLaunchFlowState): ProjectLaunchToggleState {
  return state.statesByPreset.Detected ?? { plugins: [], skills: [], mcps: [] }
}

function settingsScopeLabel(source: ToggleColumnItem['source']): string {
  if (source === 'project-local' || source === 'local') return 'local project'
  if (source === 'project') return 'project'
  if (source === 'user') return 'user'
  return 'Claude'
}

export function formatEnableLockReason(source: ToggleColumnItem['source']): string {
  return `Cannot enable: disabled in ${settingsScopeLabel(source)} Claude settings`
}

function isEnableLocked(
  detected: ProjectLaunchToggleState,
  kind: 'plugins' | 'skills' | 'mcps',
  name: string,
): boolean {
  const items = detected[kind]
  const baseline = items.find(item => item.name === name)
  return baseline !== undefined && !baseline.enabled
}

function clearToggleMessage(state: ProjectLaunchFlowState): ProjectLaunchFlowState {
  if (!state.toggleMessage) return state
  const { toggleMessage: _toggleMessage, ...rest } = state
  return rest
}

export function annotateToggleItems<T extends { name: string; enabled: boolean; source: ToggleColumnItem['source']; toggleable?: boolean }>(
  detected: ProjectLaunchToggleState,
  kind: 'plugins' | 'skills' | 'mcps',
  items: T[],
): Array<T & { enableLocked: boolean }> {
  return items.map(item => ({
    ...item,
    enableLocked: isEnableLocked(detected, kind, item.name),
  }))
}

function getActiveToggleState(state: ProjectLaunchFlowState): ProjectLaunchToggleState {
  const key = activeKey(state)
  return state.draftsByPreset[key] ?? state.statesByPreset[key] ?? { plugins: [], skills: [], mcps: [] }
}

function syncActive(state: ProjectLaunchFlowState): ProjectLaunchFlowState {
  const active = getActiveToggleState(state)
  const detected = detectedBaseline(state)
  const plugins = sortWithPinnedBottom(active.plugins, detected, 'plugins', items => sortPlugins(items, state.sortMode))
  const skills = sortWithPinnedBottom(active.skills, detected, 'skills', items => sortSkills(items, state.sortMode))
  const mcps = sortWithPinnedBottom(active.mcps, detected, 'mcps', items => sortMcps(items, state.sortMode))

  return {
    ...state,
    plugins,
    skills,
    mcps,
    pluginCursor: clamp(state.pluginCursor, plugins.length),
    skillCursor: clamp(state.skillCursor, skills.length),
    mcpCursor: clamp(state.mcpCursor, mcps.length),
  }
}

export function createProjectLaunchFlowState(input: {
  presets: LaunchPresetMeta[]
  detected: ProjectLaunchToggleState
  statesByPreset: Record<string, ProjectLaunchToggleState>
  lastUsedName?: string
}): ProjectLaunchFlowState {
  const presetItems: ProjectLaunchPresetItem[] = [
    { type: 'detected', name: 'Detected' },
    ...input.presets.map(preset => ({ type: 'preset' as const, name: preset.name, preset })),
  ]
  const presetCursor = input.lastUsedName
    ? presetItems.findIndex(item => item.name === input.lastUsedName)
    : 0
  const statesByPreset = { Detected: input.detected, ...input.statesByPreset }

  return syncActive({
    presetItems,
    statesByPreset,
    draftsByPreset: {},
    plugins: input.detected.plugins,
    skills: input.detected.skills,
    mcps: input.detected.mcps,
    focus: 'presets',
    presetCursor: presetCursor >= 0 ? presetCursor : 0,
    pluginCursor: 0,
    skillCursor: 0,
    mcpCursor: 0,
    dirty: false,
    sortMode: 'status',
  })
}

function moveFocus(state: ProjectLaunchFlowState, direction: -1 | 1): ProjectLaunchFlowState {
  const focuses: ProjectLaunchFocus[] = ['presets', 'plugins', 'skills', 'mcps']
  const index = focuses.indexOf(state.focus)
  return { ...state, focus: focuses[clamp(index + direction, focuses.length)] ?? state.focus }
}

function writeDraft(state: ProjectLaunchFlowState, draft: ProjectLaunchToggleState): ProjectLaunchFlowState {
  const key = activeKey(state)
  return {
    ...state,
    draftsByPreset: { ...state.draftsByPreset, [key]: draft },
    dirty: true,
  }
}

export function reduceProjectLaunchFlow(state: ProjectLaunchFlowState, event: ProjectLaunchFlowEvent): ProjectLaunchFlowState {
  if (event.type === 'focus-presets') return clearToggleMessage({ ...state, focus: 'presets' })
  if (event.type === 'focus-plugins') return clearToggleMessage({ ...state, focus: 'plugins' })
  if (event.type === 'focus-skills') return clearToggleMessage({ ...state, focus: 'skills' })
  if (event.type === 'focus-mcps') return clearToggleMessage({ ...state, focus: 'mcps' })
  if (event.type === 'focus-left') return clearToggleMessage(moveFocus(state, -1))
  if (event.type === 'focus-right') return clearToggleMessage(moveFocus(state, 1))

  if (event.type === 'up') {
    if (state.focus === 'plugins') return clearToggleMessage({ ...state, pluginCursor: clamp(state.pluginCursor - 1, state.plugins.length) })
    if (state.focus === 'skills') return clearToggleMessage({ ...state, skillCursor: clamp(state.skillCursor - 1, state.skills.length) })
    if (state.focus === 'mcps') return clearToggleMessage({ ...state, mcpCursor: clamp(state.mcpCursor - 1, state.mcps.length) })
    return clearToggleMessage(syncActive({ ...state, presetCursor: clamp(state.presetCursor - 1, state.presetItems.length) }))
  }

  if (event.type === 'down') {
    if (state.focus === 'plugins') return clearToggleMessage({ ...state, pluginCursor: clamp(state.pluginCursor + 1, state.plugins.length) })
    if (state.focus === 'skills') return clearToggleMessage({ ...state, skillCursor: clamp(state.skillCursor + 1, state.skills.length) })
    if (state.focus === 'mcps') return clearToggleMessage({ ...state, mcpCursor: clamp(state.mcpCursor + 1, state.mcps.length) })
    return clearToggleMessage(syncActive({ ...state, presetCursor: clamp(state.presetCursor + 1, state.presetItems.length) }))
  }

  if (event.type === 'toggle-sort-mode') {
    const sortMode = state.sortMode === 'status' ? 'name' : 'status'
    return clearToggleMessage(syncActive({ ...state, sortMode }))
  }

  if (event.type === 'toggle-current') {
    const detected = detectedBaseline(state)

    if (state.focus === 'plugins') {
      const current = state.plugins[state.pluginCursor]
      if (!current) return state
      if (!current.enabled && isEnableLocked(detected, 'plugins', current.name)) {
        return { ...state, toggleMessage: formatEnableLockReason(current.source) }
      }
      const plugins = state.plugins.map((plugin, index) => index === state.pluginCursor ? { ...plugin, enabled: !plugin.enabled } : plugin)
      return clearToggleMessage(syncActive(writeDraft(state, { plugins, skills: state.skills, mcps: state.mcps })))
    }

    if (state.focus === 'skills') {
      const current = state.skills[state.skillCursor]
      if (!current?.toggleable) return state
      if (!current.enabled && isEnableLocked(detected, 'skills', current.name)) {
        return { ...state, toggleMessage: formatEnableLockReason(current.source) }
      }
      const skills = state.skills.map((skill, index) => index === state.skillCursor ? { ...skill, enabled: !skill.enabled } : skill)
      return clearToggleMessage(syncActive(writeDraft(state, { plugins: state.plugins, skills, mcps: state.mcps })))
    }

    if (state.focus === 'mcps') {
      const current = state.mcps[state.mcpCursor]
      if (!current) return state
      if (!current.enabled && isEnableLocked(detected, 'mcps', current.name)) {
        return { ...state, toggleMessage: formatEnableLockReason(current.source) }
      }
      const mcps = state.mcps.map((mcp, index) => index === state.mcpCursor ? { ...mcp, enabled: !mcp.enabled } : mcp)
      return clearToggleMessage(syncActive(writeDraft(state, { plugins: state.plugins, skills: state.skills, mcps })))
    }
  }

  return state
}

export function getActiveProjectLaunchState(state: ProjectLaunchFlowState): ProjectLaunchToggleState {
  return getActiveToggleState(state)
}

export function getActiveProjectLaunchItem(state: ProjectLaunchFlowState): ProjectLaunchPresetItem | undefined {
  return activeItem(state)
}

export function focusProjectLaunchPreset(state: ProjectLaunchFlowState, presetName: string): ProjectLaunchFlowState {
  const presetCursor = state.presetItems.findIndex(item => item.name === presetName)
  if (presetCursor < 0) return state
  return syncActive({ ...state, focus: 'presets', presetCursor, dirty: false })
}
