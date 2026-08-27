import { describe, expect, it } from 'vitest'
import {
  applyQuickSettingsDraft,
  createSettingsSelectFlowState,
  draftHasPersistableChange,
  QUICK_SETTING_FIELDS,
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
      { field: 'defaultMode', label: 'mode', value: 'plan', source: 'preset', touched: false },
      { field: 'effortLevel', label: 'effort', value: 'high', source: 'managed', touched: false },
      { field: 'outputStyle', label: 'style', value: 'Explanatory', source: 'project-local', touched: false },
    ])
    expect(settings).toEqual({ permissions: { defaultMode: 'plan' } })

    const fallbackState = createSettingsSelectFlowState({
      items: [{ name: 'empty', settings: {}, sourcePath: '/tmp/empty.json' }],
    })
    expect(resolveQuickSettingDisplays(fallbackState).map(item => item.value)).toEqual([
      'manual',
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
    state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })

    expect(state.draftsByPreset).toEqual({
      alpha: { defaultMode: 'acceptEdits' },
      beta: { effortLevel: 'xhigh' },
    })
    expect(resolveQuickSettingDisplays(state)[1]).toMatchObject({ value: 'xhigh', source: 'pending', touched: true })
  })

  it('cycles the effort ring through max and ultracode before wrapping to low', () => {
    let state = createSettingsSelectFlowState({
      items: [{ name: 'base', settings: { effortLevel: 'xhigh' }, sourcePath: '/tmp/base.json' }],
    })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
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

  it('requires a launch arg only for the levels Claude Code ignores in settings files', () => {
    expect(resolveEffortLaunchArg([{ effortLevel: 'max' }])).toBe('max')
    expect(resolveEffortLaunchArg([{ effortLevel: 'ultracode' }])).toBe('ultracode')
    // Levels Claude Code applies from the settings file itself need no flag.
    expect(resolveEffortLaunchArg([{ effortLevel: 'xhigh' }])).toBeUndefined()
    expect(resolveEffortLaunchArg([{}])).toBeUndefined()
    expect(resolveEffortLaunchArg([undefined])).toBeUndefined()
    expect(resolveEffortLaunchArg([])).toBeUndefined()
  })

  it('resolves the effort launch arg over the scope chain, nearest scope first', () => {
    // A broader scope supplies max when no nearer scope sets effort at all.
    expect(resolveEffortLaunchArg([{}, undefined, { effortLevel: 'max' }])).toBe('max')
    // A nearer scope that sets a settings-applied level wins, so no flag is needed.
    expect(resolveEffortLaunchArg([{ effortLevel: 'low' }, { effortLevel: 'max' }])).toBeUndefined()
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
    expect(resolveQuickSettingDisplays(state)[2]).toMatchObject({
      value: 'project-only-style',
      source: 'preset',
      touched: false,
    })

    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'down' })
    state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })

    expect(state.draftsByPreset.base).toEqual({ outputStyle: 'Default' })
  })

  // The cursor bound comes from QUICK_SETTING_FIELDS while the rows come from
  // resolveQuickSettingDisplays; if the two ever drift, rows become unreachable or the cursor
  // parks on nothing.
  it('keeps the rendered rows in step with the field list the cursor is bounded by', () => {
    const state = createSettingsSelectFlowState({ items })

    expect(resolveQuickSettingDisplays(state).map(display => display.field)).toEqual([...QUICK_SETTING_FIELDS])
  })

  it('moves the quick settings cursor over all three rows and clamps at the last one', () => {
    let state = createSettingsSelectFlowState({ items })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })

    const positions: number[] = []
    for (let i = 0; i < 4; i++) {
      state = reduceSettingsSelectFlow(state, { type: 'down' })
      positions.push(state.quickCursor)
    }

    expect(positions).toEqual([1, 2, 2, 2])
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
})
