import type { Settings } from '../core/schema.js'
import { isPlainObject } from '../core/is-plain-object.js'
import { cycleSortMode, moveListCursor, remapCursorByKey } from './sortable-list-flow.js'

export type SettingsSelectSortMode = 'recent' | 'name' | 'updated'
export type SettingsSelectFocus = 'presets' | 'quick-settings'
// The draft shape names the fields, so a row cannot exist without somewhere to hold its pending
// value — and QUICK_SETTINGS below fails to compile until every field here has a descriptor.
export type QuickSettingField = keyof QuickSettingsDraft
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

// One row of the quick settings column. Everything a row does differently from its neighbours lives
// in its descriptor, so adding a row is one entry here plus one color entry in quick-setting-value.
type QuickSettingSpec<F extends QuickSettingField = QuickSettingField> = {
  field: F
  label: string
  // What the row shows when no scope in the chain sets the field.
  fallback: string
  read: (settings: Settings) => QuickSettingsDraft[F]
  // The ring the row cycles through, in order.
  candidates: (state: SettingsSelectFlowState) => readonly NonNullable<QuickSettingsDraft[F]>[]
  // Per row rather than a generic key assignment because of `defaultMode`: it merges into the
  // existing `permissions` object instead of setting a top-level key.
  apply: (settings: Settings, value: string) => Settings
}

// Pins `field` to a literal so `read` and `candidates` are checked against that one field's draft
// type rather than against the union of all of them.
function defineQuickSetting<F extends QuickSettingField>(spec: QuickSettingSpec<F>): QuickSettingSpec<F> {
  return spec
}

// The rows the quick settings column renders, in order, and the only place a field is special-cased.
export const QUICK_SETTINGS = [
  defineQuickSetting({
    field: 'defaultMode',
    label: 'mode',
    fallback: 'manual',
    read: readDefaultMode,
    candidates: () => PERMISSION_DEFAULT_MODES,
    apply: (settings, value) => ({
      ...settings,
      permissions: {
        ...(isPlainObject(settings.permissions) ? settings.permissions : {}),
        defaultMode: value,
      },
    }),
  }),
  defineQuickSetting({
    field: 'effortLevel',
    label: 'effort',
    fallback: 'model default',
    read: readEffortLevel,
    candidates: () => EFFORT_LEVELS,
    // Every level persists as `effortLevel`; max/ultracode additionally ride the `--effort` launch
    // arg (see EFFORT_LAUNCH_ARG_REQUIRED).
    apply: (settings, value) => ({ ...settings, effortLevel: value }),
  }),
  defineQuickSetting({
    field: 'outputStyle',
    label: 'style',
    fallback: 'Default',
    read: readOutputStyle,
    candidates: state => state.outputStyleCandidates,
    apply: (settings, value) => ({ ...settings, outputStyle: value }),
  }),
] as const

// A field added to QuickSettingField without a descriptor above fails to compile here rather than
// rendering no row, never persisting, or silently cycling nothing.
type AssertNoMissingQuickSetting<T extends never> = T
type _EveryQuickSettingHasASpec = AssertNoMissingQuickSetting<
  Exclude<QuickSettingField, (typeof QUICK_SETTINGS)[number]['field']>
>

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

// What one row currently reads as: the pending draft, else the nearest scope that sets the field,
// else the row's fallback. The cycle steps from the same value the row shows, so both go through
// here rather than each spelling the recipe out.
function resolveQuickSettingValue(
  spec: QuickSettingSpec,
  selected: SettingsSelectItem | undefined,
  sources: QuickSettingsSource[],
  draft: QuickSettingsDraft | undefined,
): { value: string; source: string; touched: boolean } {
  const drafted = draft?.[spec.field]
  const configured = findConfiguredValue(selected, sources, spec.read)

  return {
    value: drafted ?? configured?.value ?? spec.fallback,
    source: drafted ? 'pending' : configured?.source ?? 'default',
    touched: drafted !== undefined,
  }
}

export function resolveQuickSettingDisplays(state: SettingsSelectFlowState): QuickSettingDisplay[] {
  const selected = state.items[state.cursor]
  const draft = selected ? state.draftsByPreset[selected.name] : undefined

  return QUICK_SETTINGS.map(spec => ({
    field: spec.field,
    label: spec.label,
    ...resolveQuickSettingValue(spec, selected, state.quickSettingsSources, draft),
  }))
}

// A value outside `values` lands on index -1, so the next press starts the list over from the top.
// That is what a style set outside this column — project, managed or plugin — cycles from.
function cycleValue<T extends string>(values: readonly T[], current: string | undefined): T {
  const index = current === undefined ? -1 : values.indexOf(current as T)
  return values[(index + 1) % values.length]!
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
  return QUICK_SETTINGS.some(spec => draft?.[spec.field] !== undefined)
}

export function applyQuickSettingsDraft(settings: Settings, draft: QuickSettingsDraft | undefined): Settings {
  if (!draft) return settings

  // Seeded with `settings` itself, so a draft that sets nothing returns the caller's object
  // untouched; every `apply` builds a new object, so a draft that sets anything never does.
  return QUICK_SETTINGS.reduce<Settings>((next, spec) => {
    const value = draft[spec.field]
    return value === undefined ? next : spec.apply(next, value)
  }, settings)
}

export function reduceSettingsSelectFlow(
  state: SettingsSelectFlowState,
  event: SettingsSelectFlowEvent,
): SettingsSelectFlowState {
  if (event.type === 'up' || event.type === 'down') {
    const direction = event.type === 'up' ? -1 : 1
    if (state.focus === 'quick-settings') {
      return { ...state, quickCursor: moveListCursor(state.quickCursor, QUICK_SETTINGS.length, direction) }
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
    const spec = QUICK_SETTINGS[state.quickCursor]
    if (!selected || !spec) return state

    const draft = state.draftsByPreset[selected.name] ?? {}
    const { value } = resolveQuickSettingValue(spec, selected, state.quickSettingsSources, draft)
    // The next value comes out of this field's own candidate ring, which `defineQuickSetting` typed
    // against this field's draft slot — the cast only covers the computed key TypeScript cannot
    // correlate.
    const nextDraft = {
      ...draft,
      [spec.field]: cycleValue(spec.candidates(state), value),
    } as QuickSettingsDraft

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
