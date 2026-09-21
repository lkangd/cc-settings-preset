import { describe, expect, it } from 'vitest'
import {
  applyQuickSettingsDraft,
  createSettingsSelectFlowState,
  draftHasPersistableChange,
  QUICK_SETTINGS,
  reduceSettingsSelectFlow,
  resolveEffortLaunchArg,
  resolveQuickSettingDisplays,
} from '../../src/flows/settings-select-flow.js'

describe('settings select flow', () => {
  const items = [
    {
      name: '*Claude Official*',
      settings: {},
      sourcePath: '/tmp/official.json',
      temporary: true as const,
    },
    {
      name: 'beta',
      settings: {},
      sourcePath: '/tmp/beta.json',
      updatedAt: '2026-06-02T00:00:00.000Z',
    },
    {
      name: 'alpha',
      settings: {},
      sourcePath: '/tmp/alpha.json',
      updatedAt: '2026-06-03T00:00:00.000Z',
      isLastUsed: true,
    },
  ]

  it('starts with recent sort and keeps temporary items pinned first', () => {
    const state = createSettingsSelectFlowState({ items })
    expect(state.sortMode).toBe('recent')
    expect(state.items.map(item => item.name)).toEqual([
      '*Claude Official*',
      'alpha',
      'beta',
    ])
  })

  it('cycles to name sort and keeps the selected item stable', () => {
    const state = createSettingsSelectFlowState({ items, initialName: 'beta' })
    const sorted = reduceSettingsSelectFlow(state, { type: 'toggle-sort-mode' })

    expect(sorted.sortMode).toBe('name')
    expect(sorted.items.map(item => item.name)).toEqual([
      '*Claude Official*',
      'alpha',
      'beta',
    ])
    expect(sorted.items[sorted.cursor]?.name).toBe('beta')
  })

  it('cycles to updated sort with newest normal preset first', () => {
    const state = reduceSettingsSelectFlow(
      reduceSettingsSelectFlow(createSettingsSelectFlowState({ items }), { type: 'toggle-sort-mode' }),
      { type: 'toggle-sort-mode' },
    )

    expect(state.sortMode).toBe('updated')
    expect(state.items.map(item => item.name)).toEqual([
      '*Claude Official*',
      'alpha',
      'beta',
    ])
  })

  it('resolves preset values before configured sources and falls back without mutating settings', () => {
    const settings = { permissions: { defaultMode: 'plan' } }
    const state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings, sourcePath: '/tmp/base.json' }],
      quickSettingsSources: [
        { scope: 'managed', settings: { permissions: { defaultMode: 'acceptEdits' }, effortLevel: 'high' } },
        { scope: 'project-local', settings: { effortLevel: 'medium', outputStyle: 'Explanatory' } },
      ],
    })

    expect(resolveQuickSettingDisplays(state)).toEqual([
      { field: 'defaultMode', label: 'mode', value: 'plan', source: 'preset', touched: false, readOnly: false },
      { field: 'model', label: 'model', value: 'default', source: 'default', touched: false, readOnly: false },
      { field: 'effortLevel', label: 'effort', value: 'high', source: 'managed', touched: false, readOnly: false },
      { field: 'outputStyle', label: 'style', value: 'Explanatory', source: 'project-local', touched: false, readOnly: false },
    ])
    expect(settings).toEqual({ permissions: { defaultMode: 'plan' } })

    const fallbackState = createSettingsSelectFlowState({
      items: [{ name: 'empty', settings: {}, sourcePath: '/tmp/empty.json' }],
    })
    expect(resolveQuickSettingDisplays(fallbackState).map(item => item.value)).toEqual([
      'manual',
      'default',
      'model default',
      'Default',
    ])
  })

  it('cycles quick settings from displayed values and keeps drafts per preset', () => {
    let state = createSettingsSelectFlowState({
      items: [
        { name: 'alpha', settings: {}, sourcePath: '/tmp/alpha.json', isLastUsed: true },
        { name: 'beta', settings: { effortLevel: 'high' }, sourcePath: '/tmp/beta.json' },
      ],
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
    expect(state.draftsByPreset.alpha).toEqual({ defaultMode: 'acceptEdits' })

    state = reduceSettingsSelectFlow(state, { type: 'focus-left' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })

    expect(state.draftsByPreset).toEqual({
      alpha: { defaultMode: 'acceptEdits' },
      beta: { effortLevel: 'xhigh' },
    })
    expect(resolveQuickSettingDisplays(state)[2]).toMatchObject({ value: 'xhigh', source: 'pending', touched: true })
  })

  it('cycles the effort ring through max and ultracode before wrapping to low', () => {
    let state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings: { effortLevel: 'xhigh' }, sourcePath: '/tmp/base.json' }],
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })

    const values: string[] = []
    for (let i = 0; i < 3; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
      values.push(state.draftsByPreset.base!.effortLevel!)
    }

    expect(values).toEqual(['max', 'ultracode', 'low'])
  })

  it('persists every effort level as effortLevel, including max and ultracode', () => {
    for (const effortLevel of ['low', 'xhigh', 'max', 'ultracode'] as const) {
      expect(draftHasPersistableChange({ effortLevel })).toBe(true)
      expect(applyQuickSettingsDraft({ effortLevel: 'high' }, { effortLevel })).toEqual({ effortLevel })
    }
    expect(draftHasPersistableChange(undefined)).toBe(false)
    expect(draftHasPersistableChange({})).toBe(false)
  })

  it('restates every effort level as a launch arg, so no file can outrank the displayed level', () => {
    for (const effortLevel of ['low', 'medium', 'high', 'xhigh', 'max', 'ultracode'] as const) {
      expect(resolveEffortLaunchArg([{ effortLevel }])).toBe(effortLevel)
    }
    // Nothing set anywhere: the session keeps whatever default the model comes with.
    expect(resolveEffortLaunchArg([{}])).toBeUndefined()
    expect(resolveEffortLaunchArg([undefined])).toBeUndefined()
    expect(resolveEffortLaunchArg([])).toBeUndefined()
  })

  it('resolves the effort launch arg over the scope chain, nearest scope first', () => {
    expect(resolveEffortLaunchArg([{}, undefined, { effortLevel: 'max' }])).toBe('max')
    expect(resolveEffortLaunchArg([{ effortLevel: 'low' }, { effortLevel: 'max' }])).toBe('low')
  })

  it('resolves the effort launch arg for the model the chain selects', () => {
    expect(resolveEffortLaunchArg([
      { model: 'claude-opus-5', effortLevel: 'low' },
      { modelSettings: { 'claude-opus-5': { effortLevel: 'xhigh' } } },
    ])).toBe('low')
    expect(resolveEffortLaunchArg([
      { model: 'claude-opus-5' },
      { effortLevel: 'low', modelSettings: { 'claude-opus-5': { effortLevel: 'xhigh' } } },
    ])).toBe('xhigh')
    // Another model's saved level is not this session's.
    expect(resolveEffortLaunchArg([
      { model: 'claude-haiku-4-5', modelSettings: { 'claude-opus-5': { effortLevel: 'xhigh' } } },
    ])).toBeUndefined()
  })

  it('leaves env untouched when persisting an effort level', () => {
    expect(applyQuickSettingsDraft({ env: { FOO: 'bar' } }, { effortLevel: 'max' })).toEqual({
      effortLevel: 'max',
      env: { FOO: 'bar' },
    })
  })

  it('preserves other permission settings when applying a touched default mode', () => {
    const settings = {
      permissions: {
        defaultMode: 'plan',
        allow: ['Read(*)'],
        deny: ['Bash(rm *)'],
      },
      model: 'sonnet',
    }

    expect(applyQuickSettingsDraft(settings, { defaultMode: 'acceptEdits' })).toEqual({
      permissions: {
        defaultMode: 'acceptEdits',
        allow: ['Read(*)'],
        deny: ['Bash(rm *)'],
      },
      model: 'sonnet',
    })
    expect(applyQuickSettingsDraft(settings, { effortLevel: 'low' })).toEqual({
      ...settings,
      effortLevel: 'low',
    })
  })

  it('cycles output styles through the built-ins before the discovered ones', () => {
    let state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings: { outputStyle: 'Learning' }, sourcePath: '/tmp/base.json' }],
      outputStyles: ['Diagrams first'],
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })

    const values: string[] = []
    for (let i = 0; i < 6; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
      values.push(state.draftsByPreset.base!.outputStyle!)
    }

    expect(values).toEqual(['Diagrams first', 'Default', 'Proactive', 'Concise', 'Explanatory', 'Learning'])
  })

  it('shows a style set outside this column verbatim and cycles it back to the first candidate', () => {
    let state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings: { outputStyle: 'project-only-style' }, sourcePath: '/tmp/base.json' }],
    })
    expect(resolveQuickSettingDisplays(state)[3]).toMatchObject({
      value: 'project-only-style',
      source: 'preset',
      touched: false,
    })

    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })

    expect(state.draftsByPreset.base).toEqual({ outputStyle: 'Default' })
  })

  // Pinned to a literal rather than to QUICK_SETTINGS: the rows are a map over that table, so
  // comparing the two would compare the table with itself. The cursor is bounded by the same table,
  // so a row silently added, dropped or reordered there shows up here.
  it('renders exactly the four quick setting rows, in order', () => {
    const state = createSettingsSelectFlowState({ items })

    expect(resolveQuickSettingDisplays(state).map(display => display.field))
      .toEqual(['defaultMode', 'model', 'effortLevel', 'outputStyle'])
    expect(QUICK_SETTINGS).toHaveLength(4)
  })

  it('moves the quick settings cursor over all four rows and clamps at the last one', () => {
    let state = createSettingsSelectFlowState({ items })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })

    const positions: number[] = []
    for (let i = 0; i < 5; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'down' })
      positions.push(state.quickCursor)
    }

    expect(positions).toEqual([1, 2, 3, 3, 3])
  })

  it('persists a chosen output style, including the explicit Default', () => {
    expect(draftHasPersistableChange({ outputStyle: 'Default' })).toBe(true)
    expect(applyQuickSettingsDraft({ model: 'sonnet' }, { outputStyle: 'Default' })).toEqual({
      model: 'sonnet',
      outputStyle: 'Default',
    })
    expect(applyQuickSettingsDraft({ outputStyle: 'Learning' }, { outputStyle: 'Concise' })).toEqual({
      outputStyle: 'Concise',
    })
  })

  it('allows editing the temporary Claude Official settings', () => {
    let state = createSettingsSelectFlowState({ items })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })

    expect(state.draftsByPreset).toEqual({ '*Claude Official*': { defaultMode: 'acceptEdits' } })
  })

  it('renders a model row between mode and effort that falls back to default', () => {
    const state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings: {}, sourcePath: '/tmp/base.json' }],
    })
    const displays = resolveQuickSettingDisplays(state)

    expect(displays.map(display => display.field)).toEqual([
      'defaultMode',
      'model',
      'effortLevel',
      'outputStyle',
    ])
    expect(displays[1]).toMatchObject({ label: 'model', value: 'default', source: 'default', touched: false })
  })

  it('cycles the model ring through the built-in aliases and back to default', () => {
    let state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings: {}, sourcePath: '/tmp/base.json' }],
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })

    const values: string[] = []
    for (let i = 0; i < 5; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
      values.push(state.draftsByPreset.base!.model!)
    }

    expect(values).toEqual(['opus', 'sonnet', 'haiku', 'fable', 'default'])
  })

  it('persists a chosen model and drops the key when default is chosen', () => {
    expect(draftHasPersistableChange({ model: 'default' })).toBe(true)
    expect(applyQuickSettingsDraft({ effortLevel: 'high' }, { model: 'claude-opus-5' })).toEqual({
      effortLevel: 'high',
      model: 'claude-opus-5',
    })
    expect(applyQuickSettingsDraft({ model: 'sonnet', effortLevel: 'high' }, { model: 'default' })).toEqual({
      effortLevel: 'high',
    })
  })

  it('offers only the gateway models declared in env when the base url is not the official one', () => {
    let state = createSettingsSelectFlowState({
      items: [{
        name: 'gateway',
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://gateway.example.com/api',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-sol',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.7',
            // Pointed at the same model as sonnet: the ring must not stall on a repeated value.
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.7',
          },
        },
        sourcePath: '/tmp/gateway.json',
      }],
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })

    const values: string[] = []
    for (let i = 0; i < 4; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
      values.push(state.draftsByPreset.gateway!.model!)
    }

    expect(values).toEqual(['gpt-5.6-sol', 'glm-4.7', 'default', 'gpt-5.6-sol'])
  })

  it('replaces a redirected alias with the model it points at while default stands', () => {
    let state = createSettingsSelectFlowState({
      items: [{
        name: 'official',
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-8',
            // Names the model an unset `model` key resolves to — not a rename of the `default` row.
            ANTHROPIC_DEFAULT_MODEL: 'claude-sonnet-5',
          },
        },
        sourcePath: '/tmp/official.json',
      }],
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })

    const values: string[] = []
    for (let i = 0; i < 5; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
      values.push(state.draftsByPreset.official!.model!)
    }

    expect(values).toEqual(['claude-opus-4-8', 'sonnet', 'haiku', 'fable', 'default'])
  })

  it('appends models the chain already names to the built-in ring, once each', () => {
    let state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings: {}, sourcePath: '/tmp/base.json' }],
      quickSettingsSources: [{
        scope: 'user',
        settings: {
          model: 'opus[1m]',
          // A saved level is not a choice: this key contributes nothing to the ring.
          modelSettings: { 'claude-opus-5': { effortLevel: 'high' } },
          // `sonnet` is already a ring member, so it must not show up a second time.
          availableModels: ['sonnet', 'claude-haiku-4-5'],
        },
      }],
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })

    const values: string[] = []
    for (let i = 0; i < 7; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
      values.push(state.draftsByPreset.base!.model!)
    }

    expect(values).toEqual([
      'claude-haiku-4-5',
      'default',
      'opus',
      'sonnet',
      'haiku',
      'fable',
      'opus[1m]',
    ])
  })

  function modelRing(
    presetSettings: Record<string, unknown>,
    sources: { scope: string; settings: Record<string, unknown> }[] = [],
  ): string[] {
    let state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings: presetSettings, sourcePath: '/tmp/base.json' }],
      quickSettingsSources: sources,
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })

    const values: string[] = []
    // One lap: the ring wraps, so stopping at the value it started from names every member once.
    for (let i = 0; i < 12; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
      const value = state.draftsByPreset.base!.model!
      if (values.includes(value)) break
      values.push(value)
    }
    return values
  }

  it('merges env across scopes with the nearest scope winning each variable', () => {
    const ring = modelRing(
      { env: { ANTHROPIC_DEFAULT_OPUS_MODEL: 'near-model' } },
      [{
        scope: 'project',
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://gateway.example.com',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'far-model',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'far-sonnet',
          },
        },
      }],
    )

    expect(ring).toEqual(['near-model', 'far-sonnet', 'default'])
  })

  it('keeps the official ring for a proxy that renames no model', () => {
    expect(modelRing({ env: { ANTHROPIC_BASE_URL: 'https://proxy.example.com' } }))
      .toEqual(['opus', 'sonnet', 'haiku', 'fable', 'default'])
  })

  it('treats a base url it cannot parse as a gateway rather than as the official API', () => {
    const ring = modelRing({
      env: { ANTHROPIC_BASE_URL: 'not a url', ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-sol' },
    })

    expect(ring).toEqual(['gpt-5.6-sol', 'default'])
  })

  it("reads the selected model's saved effort over the top-level level in the same file", () => {
    const state = createSettingsSelectFlowState({
      items: [{
        name: 'base',
        settings: {
          model: 'claude-opus-5',
          effortLevel: 'medium',
          modelSettings: { 'claude-opus-5': { effortLevel: 'high' } },
        },
        sourcePath: '/tmp/base.json',
      }],
    })

    expect(resolveQuickSettingDisplays(state)[2]).toMatchObject({
      value: 'high',
      source: 'preset·model',
      touched: false,
    })
  })

  it('saves effort under the selected model and leaves every other saved level in place', () => {
    const settings = {
      model: 'claude-opus-5',
      effortLevel: 'medium',
      modelSettings: {
        'claude-opus-5': { maxEffortLevel: 'xhigh', effortLevel: 'low' },
        'claude-haiku-4-5': { effortLevel: 'low' },
      },
    }

    expect(applyQuickSettingsDraft(settings, { effortLevel: 'high' })).toEqual({
      model: 'claude-opus-5',
      // The top-level level is left alone: this column records a choice, it does not rewrite the file.
      effortLevel: 'medium',
      modelSettings: {
        'claude-opus-5': { maxEffortLevel: 'xhigh', effortLevel: 'high' },
        'claude-haiku-4-5': { effortLevel: 'low' },
      },
    })
  })

  it('saves effort at the top level when the row names an alias or default', () => {
    expect(applyQuickSettingsDraft({ model: 'opus' }, { effortLevel: 'high' })).toEqual({
      model: 'opus',
      effortLevel: 'high',
    })
    expect(applyQuickSettingsDraft({}, { effortLevel: 'high' })).toEqual({ effortLevel: 'high' })
    expect(applyQuickSettingsDraft(
      { model: 'claude-opus-5' },
      { model: 'default', effortLevel: 'high' },
    )).toEqual({ effortLevel: 'high' })
  })

  it('carries a pending effort onto the model chosen after it', () => {
    let state = createSettingsSelectFlowState({
      items: [{
        name: 'base',
        settings: { model: 'claude-opus-5', modelSettings: { 'claude-opus-5': { effortLevel: 'low' } } },
        sourcePath: '/tmp/base.json',
      }],
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    // effort: low -> medium
    state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
    state = reduceSettingsSelectFlow(state, { type: 'up' })
    // model: the ring's discovered entry -> the next member
    state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })

    const selected = state.items[0]!
    expect(state.draftsByPreset.base).toEqual({ model: 'default', effortLevel: 'medium' })
    expect(applyQuickSettingsDraft(selected.settings, state.draftsByPreset.base)).toEqual({
      effortLevel: 'medium',
      modelSettings: { 'claude-opus-5': { effortLevel: 'low' } },
    })
  })

  it('takes effort from the nearest scope that speaks about the selected model at all', () => {
    const state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings: { model: 'claude-opus-5' }, sourcePath: '/tmp/base.json' }],
      quickSettingsSources: [
        { scope: 'project', settings: { effortLevel: 'medium' } },
        { scope: 'user', settings: { modelSettings: { 'claude-opus-5': { effortLevel: 'high' } } } },
      ],
    })

    expect(resolveQuickSettingDisplays(state)[2]).toMatchObject({ value: 'medium', source: 'project' })
  })

  it('locks the model and effort rows to env and keeps the cursor on them', () => {
    let state = createSettingsSelectFlowState({
      items: [{
        name: 'base',
        settings: {
          model: 'claude-opus-5',
          effortLevel: 'low',
          env: { ANTHROPIC_MODEL: 'claude-sonnet-5', CLAUDE_CODE_EFFORT_LEVEL: 'auto' },
        },
        sourcePath: '/tmp/base.json',
      }],
    })

    expect(resolveQuickSettingDisplays(state)).toMatchObject([
      { field: 'defaultMode', readOnly: false },
      { field: 'model', value: 'claude-sonnet-5', source: 'env', readOnly: true },
      // Passed through verbatim: `auto` is a value this column never offers but the session honors.
      { field: 'effortLevel', value: 'auto', source: 'env', readOnly: true },
      { field: 'outputStyle', readOnly: false },
    ])

    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    const cycled = reduceSettingsSelectFlow(state, { type: 'cycle-current' })

    expect(cycled.quickCursor).toBe(1)
    expect(cycled.draftsByPreset).toEqual({})
  })

  it('keeps models that only appear as saved effort entries out of the ring', () => {
    // `modelSettings` accumulates a level for every model ever used, across every gateway, in the
    // one user settings file — it says nothing about what the current chain can reach.
    const ring = modelRing({}, [{
      scope: 'user',
      settings: { modelSettings: { 'claude-opus-5': { effortLevel: 'high' }, 'gpt-5.6-sol': { effortLevel: 'high' } } },
    }])

    expect(ring).toEqual(['opus', 'sonnet', 'haiku', 'fable', 'default'])
  })

  it('shows an alias as the model the gateway renames it to, and cycles back to it', () => {
    let state = createSettingsSelectFlowState({
      items: [{
        name: 'glm',
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.3-flash[1m]',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.3-flash[1m]',
          },
        },
        sourcePath: '/tmp/glm.json',
      }],
      quickSettingsSources: [{ scope: 'user', settings: { model: 'sonnet' } }],
    })

    expect(resolveQuickSettingDisplays(state)[1]).toMatchObject({
      value: 'glm-5.3-flash[1m]',
      source: 'user',
    })

    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    const values: string[] = []
    for (let i = 0; i < 2; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
      values.push(state.draftsByPreset.glm!.model!)
    }

    expect(values).toEqual(['default', 'glm-5.3-flash[1m]'])
  })

  it('offers the aliases the model picker offers, and no hybrid the picker hides', () => {
    expect(modelRing({})).toEqual(['opus', 'sonnet', 'haiku', 'fable', 'default'])
  })

  it('resolves opusplan to the one model a gateway points both of its halves at', () => {
    const state = createSettingsSelectFlowState({
      items: [{
        name: 'glm',
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.3-flash[1m]',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.3-flash[1m]',
          },
        },
        sourcePath: '/tmp/glm.json',
      }],
      quickSettingsSources: [{ scope: 'user', settings: { model: 'opusplan' } }],
    })

    expect(resolveQuickSettingDisplays(state)[1]).toMatchObject({
      value: 'glm-5.3-flash[1m]',
      source: 'user',
    })
  })

  it('keeps opusplan as itself when the two halves resolve to different models', () => {
    const state = createSettingsSelectFlowState({
      items: [{
        name: 'mix',
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://gateway.example.com',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-6',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-mix',
          },
        },
        sourcePath: '/tmp/mix.json',
      }],
      quickSettingsSources: [{ scope: 'user', settings: { model: 'opusplan' } }],
    })

    expect(resolveQuickSettingDisplays(state)[1]).toMatchObject({ value: 'opusplan', source: 'user' })
  })

  it('keeps a value the ring did not derive cyclable, so one lap comes back to it', () => {
    let state = createSettingsSelectFlowState({
      items: [{
        name: 'glm',
        settings: {
          env: {
            ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.3-flash[1m]',
          },
        },
        sourcePath: '/tmp/glm.json',
      }],
      // Inherited from the one file every preset falls back to, and unreachable behind this
      // gateway — shown all the same, because that is the model the session would ask for.
      quickSettingsSources: [{ scope: 'user', settings: { model: 'fable' } }],
    })

    expect(resolveQuickSettingDisplays(state)[1]).toMatchObject({ value: 'fable', source: 'user' })

    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    const values: string[] = []
    for (let i = 0; i < 3; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })
      values.push(state.draftsByPreset.glm!.model!)
    }

    expect(values).toEqual(['default', 'glm-5.3-flash[1m]', 'fable'])
  })

  it('resolves the launch arg model through the chain redirects, exactly as the column does', () => {
    // The user's real shape: the preset redirects sonnet, the user scope names `sonnet`, and the
    // level was saved under the model the gateway actually serves.
    expect(resolveEffortLaunchArg([
      {
        env: { ANTHROPIC_BASE_URL: 'https://gateway.example.com', ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.7' },
        effortLevel: 'medium',
        modelSettings: { 'glm-4.7': { effortLevel: 'low' } },
      },
      { model: 'sonnet' },
    ])).toBe('low')
  })

  it('routes the effort write by the model the preset env resolves the alias to', () => {
    const settings = {
      model: 'sonnet',
      env: { ANTHROPIC_BASE_URL: 'https://gateway.example.com', ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.7' },
      modelSettings: { 'glm-4.7': { effortLevel: 'low' } },
    }

    expect(applyQuickSettingsDraft(settings, { effortLevel: 'high' })).toEqual({
      ...settings,
      modelSettings: { 'glm-4.7': { effortLevel: 'high' } },
    })
  })
})
