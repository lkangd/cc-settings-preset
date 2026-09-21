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

// The aliases the ring offers out of the box — the same set Claude Code's own `/model` picker
// offers. `best`, `opus[1m]`, `sonnet[1m]` and `opusplan` are left out on purpose: this ring is
// walked one arrow press at a time, the picker does not offer them either, and a chain that names
// one still shows it.
const BUILT_IN_MODEL_CANDIDATES = [
  'default',
  'opus',
  'sonnet',
  'haiku',
  'fable',
] as const

// The variables that rename a model, in the order the gateway ring offers them.
const GATEWAY_MODEL_ENV_VARS = [
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'ANTHROPIC_DEFAULT_MODEL',
] as const

// Which variable renames each built-in ring member, so the ring shows what a session would really
// run. `default` maps to nothing on purpose: it means "name no model" rather than naming one.
// Keyed off the ring so a member added there must decide.
const MODEL_ALIAS_ENV_VARS = {
  default: undefined,
  opus: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  sonnet: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
  haiku: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  fable: 'ANTHROPIC_DEFAULT_FABLE_MODEL',
} satisfies Record<(typeof BUILT_IN_MODEL_CANDIDATES)[number], string | undefined>

// The model an alias actually reaches on this chain. `sonnet` under a gateway that renames it is
// that gateway's model, not Claude's, so the row shows the name the session really runs — which is
// also what keeps the displayed value inside the row's own ring, and therefore cyclable back to.
// `opusplan` is the one alias defined in terms of two others: it plans on opus and executes on
// sonnet, so it collapses to a single name only where the chain points both halves at one model.
function resolveModelAlias(model: string, env: Record<string, string>): string {
  if (model === 'opusplan') {
    const planning = resolveModelAlias('opus', env)
    const executing = resolveModelAlias('sonnet', env)
    return planning === executing ? planning : model
  }

  const envVar = (MODEL_ALIAS_ENV_VARS as Record<string, string | undefined>)[model]
  return (envVar ? env[envVar] : undefined) ?? model
}

// Which model the session runs under, by the one rule every path has to agree on: the variable
// that settles it outright (passed through as written, because that is what reaches the session),
// else the nearest scope that names one, resolved through the chain's own redirects. The display
// path resolves per scope instead, because it also has to say which scope the value came from, but
// it resolves aliases through the same `resolveModelAlias` — one rule, not three copies of it.
function resolveEffectiveModel(
  chain: readonly Settings[],
  env: Record<string, string>,
  draftModel?: string,
): string {
  if (env.ANTHROPIC_MODEL !== undefined) return env.ANTHROPIC_MODEL

  const named = draftModel ?? chain.map(readModel).find(model => model !== undefined)
  return resolveModelAlias(named ?? MODEL_FALLBACK, env)
}

const OFFICIAL_API_HOSTNAME = 'api.anthropic.com'

// What the model row shows when no scope names a model, and the value that removes the key again.
const MODEL_FALLBACK = 'default'

// Names Claude Code resolves to a model at run time. A `modelSettings` entry is keyed by a model's
// canonical name, and which model an alias resolves to drifts between releases, so effort chosen
// under one of these goes to the top-level key rather than to a `modelSettings` key that may never
// match anything. A gateway ID is not on this list and is treated as the real name it is.
const MODEL_ALIASES: readonly string[] = [
  ...BUILT_IN_MODEL_CANDIDATES,
  // The aliases the ring does not offer but Claude Code still resolves.
  'best',
  'opusplan',
  'opus[1m]',
  'sonnet[1m]',
]

function isConcreteModelId(model: string): boolean {
  return !MODEL_ALIASES.includes(model)
}

export type BuiltInOutputStyle = (typeof BUILT_IN_OUTPUT_STYLES)[number]

export type QuickSettingsDraft = {
  defaultMode?: PermissionDefaultMode
  model?: string
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
  // An env variable decides this row, so cycling it would change nothing the session reads. The row
  // still takes the cursor: seeing `env` in its source is how the user learns to edit the env block.
  readOnly: boolean
}

// What a row needs from the rest of the column: the model the session will run under, because effort
// is a property of a model rather than a global, and the chain's merged env block, because some
// variables outrank the settings key entirely.
export type QuickSettingContext = {
  model: string
  env: Record<string, string>
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

// The env block as Claude Code would see it for this preset: the scope chain merged variable by
// variable, the nearest scope that sets one winning. `process.env` stays out on purpose — this
// column describes what the preset makes of a session, and mixing the current shell in would make
// one preset read differently from one terminal to the next.
function mergeEnv(chain: readonly Settings[]): Record<string, string> {
  const merged: Record<string, string> = {}

  for (const settings of chain) {
    const env = settings.env
    if (!isPlainObject(env)) continue
    for (const [key, value] of Object.entries(env)) {
      if (merged[key] === undefined && typeof value === 'string' && value.trim().length > 0) {
        merged[key] = value
      }
    }
  }
  return merged
}

// The scopes a row resolves against, nearest first: the selected preset, then the broader scopes
// Claude Code would read after it.
function settingsChain(
  selected: SettingsSelectItem | undefined,
  sources: QuickSettingsSource[],
): Settings[] {
  return [...(selected ? [selected.settings] : []), ...sources.map(source => source.settings)]
}

// Whether the chain points at Anthropic's own API — the same hostname check Claude Code makes. No
// URL at all is the official API; a URL that fails to parse is not, so a typo never lets a gateway
// preset claim the Claude alias ring.
function isOfficialApi(env: Record<string, string>): boolean {
  const baseUrl = env.ANTHROPIC_BASE_URL
  if (baseUrl === undefined) return true
  try {
    return new URL(baseUrl).hostname === OFFICIAL_API_HOSTNAME
  } catch {
    return false
  }
}

// Models the chain names as a choice, in the order the ring appends them — which is how a value
// outside the built-in ring, such as `opus[1m]`, becomes selectable without this build carrying a
// list of every alias Claude Code accepts. `modelSettings` keys are deliberately not a source: that
// key is a saved-effort ledger that accumulates an entry for every model ever used, in the one user
// settings file, across every gateway — a model is in it because it once ran, not because this
// chain can reach it.
function discoverNamedModels(chain: readonly Settings[]): string[] {
  const modelKeys = chain.flatMap(settings => {
    const model = readModel(settings)
    return model ? [model] : []
  })
  const availableModels = chain.flatMap(settings => (
    Array.isArray(settings.availableModels)
      ? settings.availableModels.filter((model): model is string => typeof model === 'string')
      : []
  ))

  return [...modelKeys, ...availableModels]
}

// What the model row cycles through. Under a gateway that renames models, only the models the
// preset actually declares — the Claude aliases reach nothing there. A gateway that renames nothing
// is a plain forwarding proxy, so the official ring stands.
function resolveModelCandidates(chain: readonly Settings[], env: Record<string, string>): readonly string[] {
  if (!isOfficialApi(env)) {
    const gatewayModels = GATEWAY_MODEL_ENV_VARS
      .map(name => env[name])
      .filter((model): model is string => model !== undefined)
    if (gatewayModels.length > 0) return [...new Set(['default', ...gatewayModels])]
  }

  const ring = BUILT_IN_MODEL_CANDIDATES.map(alias => resolveModelAlias(alias, env))
  const discovered = discoverNamedModels(chain).map(model => resolveModelAlias(model, env))
  return [...new Set([...ring, ...discovered])]
}

// The ring the model row cycles, with the model the chain configures guaranteed to be in it. A
// broader scope can name a model this chain cannot derive — a Claude alias inherited by a gateway
// preset, say — and without this, one lap would walk past it and never come back. It is the
// configured value rather than the pending one: a ring that shrank as soon as the cursor stepped
// off a value would strand that value all the same.
function resolveModelRing(state: SettingsSelectFlowState): readonly string[] {
  const selected = state.items[state.cursor]
  const chain = settingsChain(selected, state.quickSettingsSources)
  const env = mergeEnv(chain)
  const candidates = resolveModelCandidates(chain, env)
  const configured = resolveModelRowValue(state, undefined, env)

  return candidates.includes(configured) ? candidates : [...candidates, configured]
}

// Any non-empty string: a preset may name a model this build has never heard of — a gateway model,
// a dated ID, an alias added after this release — and showing it verbatim beats claiming `default`.
function readModel(settings: Settings): string | undefined {
  const value = settings.model
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function toEffortLevel(value: unknown): EffortLevel | undefined {
  return EFFORT_LEVELS.find(candidate => candidate === value)
}

// The level this file gives the model in `context`: Claude Code reads a model's saved level over
// the same file's top-level key, so the row has to as well — reading only the top level is what let
// a saved level silently outrank what this column displayed.
function readEffortLevel(settings: Settings, context: QuickSettingContext): QuickSettingRead<'effortLevel'> | undefined {
  const modelSettings = settings.modelSettings
  const entry = isPlainObject(modelSettings) ? modelSettings[context.model] : undefined
  const saved = isPlainObject(entry) ? toEffortLevel(entry.effortLevel) : undefined
  if (saved !== undefined) return { value: saved, sourceSuffix: 'model' }

  return toRead(toEffortLevel(settings.effortLevel))
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
type QuickSettingRead<F extends QuickSettingField = QuickSettingField> = {
  value: NonNullable<QuickSettingsDraft[F]>
  // Appended to the scope name when the value came from somewhere other than the row's own key, so
  // `preset·model` and a bare `preset` are told apart at a glance.
  sourceSuffix?: string
}

function toRead<T>(value: T | undefined): { value: T } | undefined {
  return value === undefined ? undefined : { value }
}

type QuickSettingSpec<F extends QuickSettingField = QuickSettingField> = {
  field: F
  label: string
  // What the row shows when no scope in the chain sets the field.
  fallback: string
  read: (settings: Settings, context: QuickSettingContext) => QuickSettingRead<F> | undefined
  // The variable that outranks this row's settings key outright. When the chain's env block sets it,
  // the row shows that value, sources it to `env`, and stops cycling — arrow keys there would edit a
  // key the session never reads.
  envVar?: string
  // The ring the row cycles through, in order.
  candidates: (state: SettingsSelectFlowState) => readonly NonNullable<QuickSettingsDraft[F]>[]
  // Per row rather than a generic key assignment because of `defaultMode`: it merges into the
  // existing `permissions` object instead of setting a top-level key.
  apply: (settings: Settings, value: string, context: QuickSettingContext) => Settings
}

// Pins `field` to a literal so `read` and `candidates` are checked against that one field's draft
// type rather than against the union of all of them.
function defineQuickSetting<F extends QuickSettingField>(spec: QuickSettingSpec<F>): QuickSettingSpec<F> {
  return spec
}

// Extracted from the table below because the context every other row reads against is resolved from
// this row — which is also why it is listed before the effort row rather than after it.
const MODEL_QUICK_SETTING = defineQuickSetting({
  field: 'model',
  label: 'model',
  // `default` is a ring member, not an absent value: it is how a preset says it leaves the model to
  // the runtime, and choosing it removes the key rather than writing the word out.
  fallback: MODEL_FALLBACK,
  read: (settings, context) => {
    const model = readModel(settings)
    return toRead(model === undefined ? undefined : resolveModelAlias(model, context.env))
  },
  envVar: 'ANTHROPIC_MODEL',
  candidates: resolveModelRing,
  apply: (settings, value) => {
    if (value !== MODEL_FALLBACK) return { ...settings, model: value }
    const { model: _model, ...rest } = settings
    return rest
  },
})

// The rows the quick settings column renders, in order, and the only place a field is special-cased.
export const QUICK_SETTINGS = [
  defineQuickSetting({
    field: 'defaultMode',
    label: 'mode',
    fallback: 'manual',
    read: settings => toRead(readDefaultMode(settings)),
    candidates: () => PERMISSION_DEFAULT_MODES,
    apply: (settings, value) => ({
      ...settings,
      permissions: {
        ...(isPlainObject(settings.permissions) ? settings.permissions : {}),
        defaultMode: value,
      },
    }),
  }),
  MODEL_QUICK_SETTING,
  defineQuickSetting({
    field: 'effortLevel',
    label: 'effort',
    fallback: 'model default',
    read: readEffortLevel,
    // Not filtered by model: which levels a model accepts changes with every release, and Claude
    // Code already falls back to the highest level the model does accept.
    candidates: () => EFFORT_LEVELS,
    envVar: 'CLAUDE_CODE_EFFORT_LEVEL',
    // Saved the way Claude Code saves it: under the model when the row names a real one, at the top
    // level when it names an alias whose model this build cannot know. Nothing is removed — a level
    // saved by hand for another model is the user's, not this column's to rewrite.
    apply: (settings, value, context) => {
      if (!isConcreteModelId(context.model)) return { ...settings, effortLevel: value }

      const modelSettings = isPlainObject(settings.modelSettings) ? settings.modelSettings : {}
      const entry = modelSettings[context.model]

      return {
        ...settings,
        modelSettings: {
          ...modelSettings,
          [context.model]: { ...(isPlainObject(entry) ? entry : {}), effortLevel: value },
        },
      }
    },
  }),
  defineQuickSetting({
    field: 'outputStyle',
    label: 'style',
    fallback: 'Default',
    read: settings => toRead(readOutputStyle(settings)),
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

function findConfiguredValue(
  spec: QuickSettingSpec,
  selected: SettingsSelectItem | undefined,
  sources: QuickSettingsSource[],
  context: QuickSettingContext,
): { value: string; source: string } | undefined {
  const scoped = [
    ...(selected ? [{ scope: 'preset', settings: selected.settings }] : []),
    ...sources,
  ]

  for (const { scope, settings } of scoped) {
    const read = spec.read(settings, context)
    if (read) return { value: read.value, source: read.sourceSuffix ? `${scope}·${read.sourceSuffix}` : scope }
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
  context: QuickSettingContext,
): { value: string; source: string; touched: boolean; readOnly: boolean } {
  // Shown verbatim, whatever it says: the variable reaches the session untouched, and a value this
  // column does not recognize is still the value the session runs with.
  const locked = spec.envVar ? context.env[spec.envVar] : undefined
  if (locked !== undefined) return { value: locked, source: 'env', touched: false, readOnly: true }

  const drafted = draft?.[spec.field]
  const configured = findConfiguredValue(spec, selected, sources, context)

  return {
    value: drafted ?? configured?.value ?? spec.fallback,
    source: drafted ? 'pending' : configured?.source ?? 'default',
    touched: drafted !== undefined,
    readOnly: false,
  }
}

// The model row resolved on its own, before any other row reads: effort is stored per model, so
// every other row needs to know which model it belongs to. The seed context is only ever read by
// rows that consult `context.model`, which the model row itself does not.
function resolveModelRowValue(
  state: SettingsSelectFlowState,
  draft: QuickSettingsDraft | undefined,
  env: Record<string, string>,
): string {
  const seed: QuickSettingContext = { model: MODEL_FALLBACK, env }
  const { value } = resolveQuickSettingValue(
    MODEL_QUICK_SETTING,
    state.items[state.cursor],
    state.quickSettingsSources,
    draft,
    seed,
  )

  return value
}

// Takes what the caller already holds rather than re-deriving it, so the cursor lookup that decides
// which preset a row speaks about exists once per call path.
function resolveQuickSettingContext(
  state: SettingsSelectFlowState,
  selected: SettingsSelectItem | undefined,
  draft: QuickSettingsDraft | undefined,
): QuickSettingContext {
  const env = mergeEnv(settingsChain(selected, state.quickSettingsSources))

  return { model: resolveModelRowValue(state, draft, env), env }
}

export function resolveQuickSettingDisplays(state: SettingsSelectFlowState): QuickSettingDisplay[] {
  const selected = state.items[state.cursor]
  const draft = selected ? state.draftsByPreset[selected.name] : undefined
  const context = resolveQuickSettingContext(state, selected, draft)

  return QUICK_SETTINGS.map(spec => ({
    field: spec.field,
    label: spec.label,
    ...resolveQuickSettingValue(spec, selected, state.quickSettingsSources, draft, context),
  }))
}

// A value outside `values` lands on index -1, so the next press starts the list over from the top.
// That is what a style set outside this column — project, managed or plugin — cycles from.
function cycleValue<T extends string>(values: readonly T[], current: string | undefined): T {
  const index = current === undefined ? -1 : values.indexOf(current as T)
  return values[(index + 1) % values.length]!
}

// The `--effort` value the launch restates, or undefined when no scope sets a level at all. Passed
// unconditionally rather than only for the levels a settings file cannot express: `--effort` is the
// one place a level outranks every file, so restating it is what keeps the session running at the
// level this column displays no matter which file holds a `modelSettings` entry for the model.
// `chain` is the same scope chain the column resolves against — the preset first, then broader.
export function resolveEffortLaunchArg(chain: readonly unknown[]): EffortLevel | undefined {
  const settingsChain = chain.filter(isPlainObject) as Settings[]
  const env = mergeEnv(settingsChain)
  const context: QuickSettingContext = { model: resolveEffectiveModel(settingsChain, env), env }

  for (const settings of settingsChain) {
    const read = readEffortLevel(settings, context)
    if (read) return read.value
  }
  return undefined
}

// Whether a draft has any change worth writing to a preset file.
export function draftHasPersistableChange(draft: QuickSettingsDraft | undefined): boolean {
  return QUICK_SETTINGS.some(spec => draft?.[spec.field] !== undefined)
}

// The model a draft writes against: what the user just picked in the model row, else what this file
// already names. A draft that changed the model carries the effort chosen before that switch, and
// the level lands under the model now selected — the choice was "high this time", not "high for the
// model I happened to be on".
function resolveApplyContext(settings: Settings, draft: QuickSettingsDraft): QuickSettingContext {
  const env = mergeEnv([settings])

  return { model: resolveEffectiveModel([settings], env, draft.model), env }
}

export function applyQuickSettingsDraft(settings: Settings, draft: QuickSettingsDraft | undefined): Settings {
  if (!draft) return settings

  const context = resolveApplyContext(settings, draft)

  // Seeded with `settings` itself, so a draft that sets nothing returns the caller's object
  // untouched; every `apply` builds a new object, so a draft that sets anything never does.
  return QUICK_SETTINGS.reduce<Settings>((next, spec) => {
    const value = draft[spec.field]
    return value === undefined ? next : spec.apply(next, value, context)
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
    const context = resolveQuickSettingContext(state, selected, draft)
    const { value, readOnly } = resolveQuickSettingValue(
      spec,
      selected,
      state.quickSettingsSources,
      draft,
      context,
    )
    if (readOnly) return state
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
