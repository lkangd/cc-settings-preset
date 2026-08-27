import type { Settings } from '../core/schema.js'
import { isPlainObject } from '../core/is-plain-object.js'
import { cycleSortMode, moveListCursor, remapCursorByKey } from './sortable-list-flow.js'

export type SettingsSelectSortMode = 'recent' | 'name' | 'updated'
export type SettingsSelectFocus = 'presets' | 'quick-settings'
export type QuickSettingField = 'defaultMode' | 'effortLevel' | 'outputStyle'
export type PermissionDefaultMode = 'manual' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk' | 'bypassPermissions'
// Every level is persisted the same way: as the `effortLevel` setting of the preset.
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultracode'

// Levels Claude Code does not honor as an `effortLevel` setting value, so persisting them is not
// enough — the launch must also pass `--effort <level>`, which outranks every settings scope.
export const EFFORT_LAUNCH_ARG_REQUIRED: readonly EffortLevel[] = ['max', 'ultracode']

export const PERMISSION_DEFAULT_MODES: readonly PermissionDefaultMode[] = [
  'manual',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
]
export const EFFORT_LEVELS: readonly EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode']

// Listed in the order the official docs list them. Custom styles follow these, so adding or removing
// a style file never shifts a built-in's position. `Default` is written out explicitly rather than
// removing the key, so the preset always states which style it runs under.
const BUILT_IN_OUTPUT_STYLES = [
  'Default',
  'Proactive',
  'Concise',
  'Explanatory',
  'Learning',
] as const

export type BuiltInOutputStyle = (typeof BUILT_IN_OUTPUT_STYLES)[number]

// The rows the quick settings column renders, in order. Kept as its own list so the cursor bound
// does not have to resolve every row's effective value just to count them.
export const QUICK_SETTING_FIELDS: readonly QuickSettingField[] = [
  'defaultMode',
  'effortLevel',
  'outputStyle',
]

export type QuickSettingsDraft = {
  defaultMode?: PermissionDefaultMode
  effortLevel?: EffortLevel
  outputStyle?: string
}

export type QuickSettingsSource = {
  scope: string
  settings: Settings
}

export type QuickSettingDisplay = {
  field: QuickSettingField
  label: string
  value: string
  source: string
  touched: boolean
}

export type SettingsSelectItem = {
  name: string
  settings: Settings
  sourcePath: string
  temporary?: boolean
  updatedAt?: string
  isLastUsed?: boolean
}

export type SettingsSelectFlowState = {
  rawItems: SettingsSelectItem[]
  items: SettingsSelectItem[]
  cursor: number
  sortMode: SettingsSelectSortMode
  focus: SettingsSelectFocus
  quickCursor: number
  draftsByPreset: Record<string, QuickSettingsDraft>
  quickSettingsSources: QuickSettingsSource[]
  // Built-ins merged with the discovered styles — what the style row cycles through. Distinct from
  // the `outputStyles` input, which carries only the styles found on disk.
  outputStyleCandidates: string[]
}

export type SettingsSelectFlowEvent =
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'focus-left' }
  | { type: 'focus-right' }
  | { type: 'cycle-current' }
  | { type: 'toggle-sort-mode' }

const SETTINGS_SELECT_SORT_MODES: readonly SettingsSelectSortMode[] = ['recent', 'name', 'updated']

export function formatSettingsSortMode(sortMode: SettingsSelectSortMode): string {
  if (sortMode === 'recent') return 'Sorted by recent'
  if (sortMode === 'updated') return 'Sorted by updated'
  return 'Sorted by name'
}

function sortSettingsItems(
  items: SettingsSelectItem[],
  sortMode: SettingsSelectSortMode,
): SettingsSelectItem[] {
  const temporary = items.filter(item => item.temporary)
  const regular = items.filter(item => !item.temporary)

  const sortedRegular = [...regular].sort((a, b) => {
    if (sortMode === 'recent') {
      if (Boolean(a.isLastUsed) !== Boolean(b.isLastUsed)) return a.isLastUsed ? -1 : 1
      return a.name.localeCompare(b.name)
    }

    if (sortMode === 'updated') {
      const updatedOrder = (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      if (updatedOrder !== 0) return updatedOrder
      return a.name.localeCompare(b.name)
    }

    return a.name.localeCompare(b.name)
  })

  return [...temporary, ...sortedRegular]
}

export function createSettingsSelectFlowState(input: {
  items: SettingsSelectItem[]
  initialName?: string
  quickSettingsSources?: QuickSettingsSource[]
  // Custom style names discovered on disk; the built-ins are merged in here so the reducer stays a
  // pure function over state rather than reading the filesystem when the user cycles.
  outputStyles?: string[]
}): SettingsSelectFlowState {
  const sortMode: SettingsSelectSortMode = 'recent'
  const items = sortSettingsItems(input.items, sortMode)
  const cursor = input.initialName
    ? items.findIndex(item => item.name === input.initialName)
    : 0

  return {
    rawItems: input.items,
    items,
    cursor: cursor >= 0 ? cursor : 0,
    sortMode,
    focus: 'presets',
    quickCursor: 0,
    draftsByPreset: {},
    quickSettingsSources: input.quickSettingsSources ?? [],
    outputStyleCandidates: [...new Set([...BUILT_IN_OUTPUT_STYLES, ...(input.outputStyles ?? [])])],
  }
}

function readDefaultMode(settings: Settings): PermissionDefaultMode | undefined {
  const permissions = settings.permissions
  if (!isPlainObject(permissions)) return undefined
  const value = permissions.defaultMode === 'default' ? 'manual' : permissions.defaultMode
  return PERMISSION_DEFAULT_MODES.find(candidate => candidate === value)
}

function readEffortLevel(settings: Settings): EffortLevel | undefined {
  return EFFORT_LEVELS.find(candidate => candidate === settings.effortLevel)
}

// Any non-empty string, not just a known style: project-level, managed and plugin styles all resolve
// for Claude Code but are outside what this column discovers, and showing them verbatim beats
// pretending the preset has no style set.
function readOutputStyle(settings: Settings): string | undefined {
  const value = settings.outputStyle
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function findConfiguredValue<T>(
  selected: SettingsSelectItem | undefined,
  sources: QuickSettingsSource[],
  readValue: (settings: Settings) => T | undefined,
): { value: T; source: string } | undefined {
  if (selected) {
    const presetValue = readValue(selected.settings)
    if (presetValue !== undefined) return { value: presetValue, source: 'preset' }
  }

  for (const source of sources) {
    const value = readValue(source.settings)
    if (value !== undefined) return { value, source: source.scope }
  }
  return undefined
}

export function resolveQuickSettingDisplays(state: SettingsSelectFlowState): QuickSettingDisplay[] {
  const selected = state.items[state.cursor]
  const draft = selected ? state.draftsByPreset[selected.name] : undefined
  const configuredDefaultMode = findConfiguredValue(selected, state.quickSettingsSources, readDefaultMode)
  const configuredEffortLevel = findConfiguredValue(selected, state.quickSettingsSources, readEffortLevel)
  const configuredOutputStyle = findConfiguredValue(selected, state.quickSettingsSources, readOutputStyle)

  return [
    {
      field: 'defaultMode',
      label: 'mode',
      value: draft?.defaultMode ?? configuredDefaultMode?.value ?? 'manual',
      source: draft?.defaultMode ? 'pending' : configuredDefaultMode?.source ?? 'default',
      touched: draft?.defaultMode !== undefined,
    },
    {
      field: 'effortLevel',
      label: 'effort',
      value: draft?.effortLevel ?? configuredEffortLevel?.value ?? 'model default',
      source: draft?.effortLevel ? 'pending' : configuredEffortLevel?.source ?? 'default',
      touched: draft?.effortLevel !== undefined,
    },
    {
      field: 'outputStyle',
      label: 'style',
      value: draft?.outputStyle ?? configuredOutputStyle?.value ?? 'Default',
      source: draft?.outputStyle ? 'pending' : configuredOutputStyle?.source ?? 'default',
      touched: draft?.outputStyle !== undefined,
    },
  ]
}

// A value outside `values` lands on index -1, so the next press starts the list over from the top.
// That is what a style set outside this column — project, managed or plugin — cycles from.
function cycleValue<T extends string>(values: readonly T[], current: string | undefined): T {
  const index = current === undefined ? -1 : values.indexOf(current as T)
  return values[(index + 1) % values.length]!
}

function cycleDraftField(
  draft: QuickSettingsDraft,
  field: QuickSettingField,
  current: string,
  outputStyleCandidates: readonly string[],
): QuickSettingsDraft {
  switch (field) {
    case 'defaultMode':
      return { ...draft, defaultMode: cycleValue(PERMISSION_DEFAULT_MODES, current) }
    case 'effortLevel':
      return { ...draft, effortLevel: cycleValue(EFFORT_LEVELS, current) }
    case 'outputStyle':
      return { ...draft, outputStyle: cycleValue(outputStyleCandidates, current) }
    default: {
      // A new field added to QuickSettingField fails to compile here rather than silently
      // cycling some other field's value.
      const exhaustive: never = field
      return exhaustive
    }
  }
}

// The launch-time `--effort` value a launch needs, or undefined when the effective level is one
// Claude Code applies from the settings file on its own. `settingsChain` is the scope chain the
// quick settings column resolves against — the preset first, then broader scopes — because the
// level shown as effective there is the one the session must actually run at.
export function resolveEffortLaunchArg(settingsChain: readonly unknown[]): EffortLevel | undefined {
  for (const settings of settingsChain) {
    if (!isPlainObject(settings)) continue
    const level = readEffortLevel(settings)
    if (level === undefined) continue
    return EFFORT_LAUNCH_ARG_REQUIRED.includes(level) ? level : undefined
  }
  return undefined
}

// Whether a draft has any change worth writing to a preset file.
export function draftHasPersistableChange(draft: QuickSettingsDraft | undefined): boolean {
  return Boolean(draft && (
    draft.defaultMode !== undefined
    || draft.effortLevel !== undefined
    || draft.outputStyle !== undefined
  ))
}

export function applyQuickSettingsDraft(settings: Settings, draft: QuickSettingsDraft | undefined): Settings {
  if (!draft || !draftHasPersistableChange(draft)) return settings

  const next: Settings = { ...settings }
  // Every level persists as `effortLevel`; max/ultracode additionally ride the `--effort` launch arg
  // (see EFFORT_LAUNCH_ARG_REQUIRED).
  if (draft.effortLevel !== undefined) next.effortLevel = draft.effortLevel
  if (draft.outputStyle !== undefined) next.outputStyle = draft.outputStyle
  if (draft.defaultMode !== undefined) {
    const permissions = isPlainObject(settings.permissions) ? settings.permissions : {}
    next.permissions = { ...permissions, defaultMode: draft.defaultMode }
  }
  return next
}

export function reduceSettingsSelectFlow(
  state: SettingsSelectFlowState,
  event: SettingsSelectFlowEvent,
): SettingsSelectFlowState {
  if (event.type === 'up' || event.type === 'down') {
    const direction = event.type === 'up' ? -1 : 1
    if (state.focus === 'quick-settings') {
      return { ...state, quickCursor: moveListCursor(state.quickCursor, QUICK_SETTING_FIELDS.length, direction) }
    }
    return { ...state, cursor: moveListCursor(state.cursor, state.items.length, direction) }
  }

  if (event.type === 'focus-left') {
    return { ...state, focus: 'presets' }
  }

  if (event.type === 'focus-right') {
    return { ...state, focus: 'quick-settings' }
  }

  if (event.type === 'cycle-current') {
    const selected = state.items[state.cursor]
    if (!selected) return state

    const displays = resolveQuickSettingDisplays(state)
    const current = displays[state.quickCursor]
    if (!current) return state
    const draft = state.draftsByPreset[selected.name] ?? {}
    const nextDraft = cycleDraftField(draft, current.field, current.value, state.outputStyleCandidates)

    return {
      ...state,
      draftsByPreset: { ...state.draftsByPreset, [selected.name]: nextDraft },
    }
  }

  if (event.type === 'toggle-sort-mode') {
    const sortMode = cycleSortMode(SETTINGS_SELECT_SORT_MODES, state.sortMode)
    const items = sortSettingsItems(state.rawItems, sortMode)

    return {
      ...state,
      items,
      sortMode,
      cursor: remapCursorByKey(state.items, items, state.cursor, item => item.name),
    }
  }

  return state
}

export function renameSettingsSelectItem(
  state: SettingsSelectFlowState,
  previousName: string,
  nextName: string,
): SettingsSelectFlowState {
  const renameItem = (item: SettingsSelectItem) => (
    item.name === previousName ? { ...item, name: nextName } : item
  )

  const renamedDraft = state.draftsByPreset[previousName]
  const draftsByPreset = { ...state.draftsByPreset }
  if (renamedDraft) {
    delete draftsByPreset[previousName]
    draftsByPreset[nextName] = renamedDraft
  }

  return {
    ...state,
    rawItems: state.rawItems.map(renameItem),
    items: state.items.map(renameItem),
    draftsByPreset,
  }
}
