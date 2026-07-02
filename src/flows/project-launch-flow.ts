import type { LaunchPresetMeta } from '../core/schema.js'
import { escapeColumnFocus, moveColumnFocus } from './column-navigation-flow.js'
import {
  resolveDisableLockLocation,
  type DisableLockSource,
  type DisableRemovalMark,
} from '../services/disable-lock-service.js'
import { sortPluginStates, type PluginState } from '../services/plugin-service.js'
import { sortSkillStatesByStatus, type SkillState } from '../services/skill-service.js'
import type { McpState } from '../services/mcp-service.js'
import { syncMcpsWithPlugins } from '../services/mcp-service.js'

export type { DisableRemovalMark }

export type ProjectLaunchFocus = 'presets' | 'plugins' | 'skills' | 'mcps'
export type ProjectLaunchSortMode = 'status' | 'name'

export type ProjectLaunchToggleState = {
  plugins: PluginState[]
  skills: SkillState[]
  mcps: McpState[]
}

export type ChangedProjectLaunchPresets = Record<string, ProjectLaunchToggleState>

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
  disableLockSources: DisableLockSource[]
  pendingEnableUnlock?: {
    kind: 'plugins' | 'skills' | 'mcps'
    name: string
    filePath?: string
    requiredPlugin?: string
  }
  pendingDisableRemovals: DisableRemovalMark[]
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
  | { type: 'escape' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'toggle-current' }
  | { type: 'toggle-sort-mode' }
  | { type: 'confirm-enable-unlock' }
  | { type: 'cancel-enable-unlock' }

export function formatProjectLaunchSortMode(sortMode: ProjectLaunchSortMode): string {
  return sortMode === 'name' ? 'Sorted by name' : 'Sorted by status'
}

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
  state: ProjectLaunchFlowState,
  detected: ProjectLaunchToggleState,
  kind: 'plugins' | 'skills' | 'mcps',
  item: { name: string; enabled: boolean },
): boolean {
  return isItemEnableLocked(state, detected, kind, item) && !item.enabled
}

function sortWithPinnedBottom<T extends { name: string; enabled: boolean }>(
  items: T[],
  state: ProjectLaunchFlowState,
  detected: ProjectLaunchToggleState,
  kind: 'plugins' | 'skills' | 'mcps',
  sortRegular: (regular: T[]) => T[],
): T[] {
  const pinned: T[] = []
  const regular: T[] = []

  for (const item of items) {
    if (isPinnedToBottom(state, detected, kind, item)) pinned.push(item)
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
  state: ProjectLaunchFlowState,
  detected: ProjectLaunchToggleState,
  kind: 'plugins' | 'skills' | 'mcps',
  name: string,
): boolean {
  if (state.pendingDisableRemovals.some(mark => mark.kind === kind && mark.name === name)) {
    return false
  }
  const items = detected[kind]
  const baseline = items.find(item => item.name === name)
  return baseline !== undefined && !baseline.enabled
}

function appendDisableRemovalMark(state: ProjectLaunchFlowState, mark: DisableRemovalMark): DisableRemovalMark[] {
  if (state.pendingDisableRemovals.some(
    existing => existing.kind === mark.kind && existing.name === mark.name && existing.filePath === mark.filePath,
  )) {
    return state.pendingDisableRemovals
  }
  return [...state.pendingDisableRemovals, mark]
}

function clearPendingEnableUnlock(state: ProjectLaunchFlowState): ProjectLaunchFlowState {
  if (!state.pendingEnableUnlock) return state
  const { pendingEnableUnlock: _pendingEnableUnlock, ...rest } = state
  return rest
}

function isMcpPluginLocked(mcp: McpState, plugins: PluginState[]): boolean {
  if (!mcp.controlledByPlugin || mcp.enabled) return false
  const parent = plugins.find(plugin => plugin.name === mcp.controlledByPlugin)
  return parent !== undefined && !parent.enabled
}

function isItemEnableLocked(
  state: ProjectLaunchFlowState,
  detected: ProjectLaunchToggleState,
  kind: 'plugins' | 'skills' | 'mcps',
  item: { name: string; enabled: boolean; controlledByPlugin?: string },
): boolean {
  if (kind === 'mcps' && isMcpPluginLocked(item as McpState, state.plugins)) return true
  return isEnableLocked(state, detected, kind, item.name)
}

function requestLockedMcpEnableToggle(
  state: ProjectLaunchFlowState,
  current: McpState,
): ProjectLaunchFlowState {
  const detected = detectedBaseline(state)

  if (isMcpPluginLocked(current, state.plugins)) {
    const requiredPlugin = current.controlledByPlugin!
    const pluginLockedInSettings = isEnableLocked(state, detected, 'plugins', requiredPlugin)
    const filePath = pluginLockedInSettings
      ? resolveDisableLockLocation('plugins', requiredPlugin, state.disableLockSources)
      : undefined

    return clearToggleMessage({
      ...state,
      pendingEnableUnlock: {
        kind: 'mcps',
        name: current.name,
        requiredPlugin,
        ...(filePath ? { filePath } : {}),
      },
    })
  }

  if (!isEnableLocked(state, detected, 'mcps', current.name)) return state

  const filePath = resolveDisableLockLocation('mcps', current.name, state.disableLockSources)
  if (!filePath) {
    return { ...state, toggleMessage: formatEnableLockReason(current.source) }
  }

  return clearToggleMessage({
    ...state,
    pendingEnableUnlock: { kind: 'mcps', name: current.name, filePath },
  })
}

function enablePluginInDraft(state: ProjectLaunchFlowState, pluginName: string, draftState: ProjectLaunchToggleState): ProjectLaunchToggleState {
  const plugins = draftState.plugins.map(plugin => (
    plugin.name === pluginName ? { ...plugin, enabled: true } : plugin
  ))
  return {
    ...draftState,
    plugins,
    mcps: syncMcpsWithPlugins(plugins, draftState.mcps),
  }
}

function requestLockedEnableToggle(
  state: ProjectLaunchFlowState,
  kind: 'plugins' | 'skills' | 'mcps',
  current: { name: string; enabled: boolean; source: ToggleColumnItem['source'] },
): ProjectLaunchFlowState {
  const detected = detectedBaseline(state)
  if (current.enabled || !isEnableLocked(state, detected, kind, current.name)) return state

  const filePath = resolveDisableLockLocation(kind, current.name, state.disableLockSources)
  if (!filePath) {
    return { ...state, toggleMessage: formatEnableLockReason(current.source) }
  }

  return clearToggleMessage({
    ...state,
    pendingEnableUnlock: { kind, name: current.name, filePath },
  })
}

function clearToggleMessage(state: ProjectLaunchFlowState): ProjectLaunchFlowState {
  if (!state.toggleMessage) return state
  const { toggleMessage: _toggleMessage, ...rest } = state
  return rest
}

export function annotateToggleItems<T extends { name: string; enabled: boolean; source: ToggleColumnItem['source']; toggleable?: boolean; controlledByPlugin?: string }>(
  state: ProjectLaunchFlowState,
  detected: ProjectLaunchToggleState,
  kind: 'plugins' | 'skills' | 'mcps',
  items: T[],
): Array<T & { enableLocked: boolean }> {
  return items.map(item => ({
    ...item,
    enableLocked: isItemEnableLocked(state, detected, kind, item),
  }))
}

function getActiveToggleState(state: ProjectLaunchFlowState): ProjectLaunchToggleState {
  const key = activeKey(state)
  return state.draftsByPreset[key] ?? state.statesByPreset[key] ?? { plugins: [], skills: [], mcps: [] }
}

function syncActive(state: ProjectLaunchFlowState): ProjectLaunchFlowState {
  const active = getActiveToggleState(state)
  const detected = detectedBaseline(state)
  const plugins = sortWithPinnedBottom(active.plugins, state, detected, 'plugins', items => sortPlugins(items, state.sortMode))
  const skills = sortWithPinnedBottom(active.skills, state, detected, 'skills', items => sortSkills(items, state.sortMode))
  const mcps = sortWithPinnedBottom(active.mcps, state, detected, 'mcps', items => sortMcps(items, state.sortMode))

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
  disableLockSources?: DisableLockSource[]
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
    disableLockSources: input.disableLockSources ?? [],
    pendingDisableRemovals: [],
  })
}

const PROJECT_LAUNCH_FOCUSES: readonly ProjectLaunchFocus[] = ['presets', 'plugins', 'skills', 'mcps']

function moveFocus(state: ProjectLaunchFlowState, direction: -1 | 1): ProjectLaunchFlowState {
  return { ...state, focus: moveColumnFocus(PROJECT_LAUNCH_FOCUSES, state.focus, direction) }
}

export function shouldBubbleProjectLaunchEscape(state: ProjectLaunchFlowState): boolean {
  return escapeColumnFocus(state.focus, 'presets').bubbled
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
  if (event.type === 'escape') {
    const escaped = escapeColumnFocus(state.focus, 'presets')
    return clearToggleMessage({ ...state, focus: escaped.focus })
  }

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

  if (event.type === 'confirm-enable-unlock') {
    const pending = state.pendingEnableUnlock
    if (!pending) return state

    let nextState = clearPendingEnableUnlock(state)
    if (pending.filePath) {
      nextState = {
        ...nextState,
        pendingDisableRemovals: appendDisableRemovalMark(state, {
          kind: pending.requiredPlugin ? 'plugins' : pending.kind,
          name: pending.requiredPlugin ?? pending.name,
          filePath: pending.filePath,
        }),
      }
    }

    if (pending.kind === 'plugins') {
      const plugins = state.plugins.map((plugin, index) => (
        index === state.pluginCursor ? { ...plugin, enabled: true } : plugin
      ))
      return clearToggleMessage(syncActive(writeDraft(nextState, {
        plugins,
        skills: state.skills,
        mcps: syncMcpsWithPlugins(plugins, state.mcps),
      })))
    }

    if (pending.kind === 'skills') {
      const skills = state.skills.map((skill, index) => (
        index === state.skillCursor ? { ...skill, enabled: true } : skill
      ))
      return clearToggleMessage(syncActive(writeDraft(nextState, { plugins: state.plugins, skills, mcps: state.mcps })))
    }

    let draft: ProjectLaunchToggleState = {
      plugins: state.plugins,
      skills: state.skills,
      mcps: state.mcps.map((mcp, index) => (
        index === state.mcpCursor ? { ...mcp, enabled: true } : mcp
      )),
    }
    if (pending.requiredPlugin) {
      draft = enablePluginInDraft(nextState, pending.requiredPlugin, draft)
    }
    return clearToggleMessage(syncActive(writeDraft(nextState, draft)))
  }

  if (event.type === 'cancel-enable-unlock') {
    return clearPendingEnableUnlock(state)
  }

  if (event.type === 'toggle-current') {
    if (state.focus === 'plugins') {
      const current = state.plugins[state.pluginCursor]
      if (!current) return state
      const locked = requestLockedEnableToggle(state, 'plugins', current)
      if (locked !== state) return locked
      const plugins = state.plugins.map((plugin, index) => index === state.pluginCursor ? { ...plugin, enabled: !plugin.enabled } : plugin)
      return clearToggleMessage(syncActive(writeDraft(state, {
        plugins,
        skills: state.skills,
        mcps: syncMcpsWithPlugins(plugins, state.mcps),
      })))
    }

    if (state.focus === 'skills') {
      const current = state.skills[state.skillCursor]
      if (!current?.toggleable) return state
      const locked = requestLockedEnableToggle(state, 'skills', current)
      if (locked !== state) return locked
      const skills = state.skills.map((skill, index) => index === state.skillCursor ? { ...skill, enabled: !skill.enabled } : skill)
      return clearToggleMessage(syncActive(writeDraft(state, { plugins: state.plugins, skills, mcps: state.mcps })))
    }

    if (state.focus === 'mcps') {
      const current = state.mcps[state.mcpCursor]
      if (!current) return state
      if (!current.enabled) {
        const locked = requestLockedMcpEnableToggle(state, current)
        if (locked !== state) return locked
      }
      const mcps = state.mcps.map((mcp, index) => index === state.mcpCursor ? { ...mcp, enabled: !mcp.enabled } : mcp)
      return clearToggleMessage(syncActive(writeDraft(state, { plugins: state.plugins, skills: state.skills, mcps })))
    }
  }

  return state
}

export function getPendingDisableRemovals(state: ProjectLaunchFlowState): DisableRemovalMark[] {
  return state.pendingDisableRemovals
}

export function getActiveProjectLaunchState(state: ProjectLaunchFlowState): ProjectLaunchToggleState {
  return getActiveToggleState(state)
}

export function getActiveProjectLaunchItem(state: ProjectLaunchFlowState): ProjectLaunchPresetItem | undefined {
  return activeItem(state)
}

export function getChangedProjectLaunchPresets(state: ProjectLaunchFlowState): ChangedProjectLaunchPresets {
  return Object.fromEntries(
    Object.entries(state.draftsByPreset).filter(([name]) => name !== 'Detected' && state.statesByPreset[name]),
  )
}

export function changedProjectLaunchPresetProps(changedPresets: ChangedProjectLaunchPresets): { changedPresets?: ChangedProjectLaunchPresets } {
  return Object.keys(changedPresets).length > 0 ? { changedPresets } : {}
}

export function focusProjectLaunchPreset(state: ProjectLaunchFlowState, presetName: string): ProjectLaunchFlowState {
  const presetCursor = state.presetItems.findIndex(item => item.name === presetName)
  if (presetCursor < 0) return state
  return syncActive({ ...state, focus: 'presets', presetCursor, dirty: false })
}
