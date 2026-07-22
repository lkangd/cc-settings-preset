import { describe, expect, it } from 'vitest'
import {
  applyQuickSettingsDraft,
  createSettingsSelectFlowState,
  draftHasPersistableChange,
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
        { scope: 'project-local', settings: { effortLevel: 'medium' } },
      ],
    })

    expect(resolveQuickSettingDisplays(state)).toEqual([
      { field: 'defaultMode', label: 'mode', value: 'plan', source: 'preset', touched: false },
      { field: 'effortLevel', label: 'effort', value: 'high', source: 'managed', touched: false },
    ])
    expect(settings).toEqual({ permissions: { defaultMode: 'plan' } })

    const fallbackState = createSettingsSelectFlowState({
      items: [{ name: 'empty', settings: {}, sourcePath: '/tmp/empty.json' }],
    })
    expect(resolveQuickSettingDisplays(fallbackState).map(item => item.value)).toEqual(['manual', 'model default'])
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

  it('treats ultracode as a launch-arg-only effort that never touches persisted settings', () => {
    expect(resolveEffortLaunchArg({ effortLevel: 'ultracode' })).toBe('ultracode')
    expect(resolveEffortLaunchArg({ effortLevel: 'max' })).toBeUndefined()
    expect(resolveEffortLaunchArg({ defaultMode: 'plan' })).toBeUndefined()

    expect(draftHasPersistableChange({ effortLevel: 'ultracode' })).toBe(false)
    expect(draftHasPersistableChange({ effortLevel: 'ultracode', defaultMode: 'plan' })).toBe(true)
    expect(draftHasPersistableChange({ effortLevel: 'max' })).toBe(true)

    // ultracode leaves the effort part of the settings untouched.
    expect(applyQuickSettingsDraft({ effortLevel: 'high' }, { effortLevel: 'ultracode' })).toEqual({
      effortLevel: 'high',
    })
  })

  it('routes a max effort selection through the CLAUDE_CODE_EFFORT_LEVEL env var', () => {
    expect(applyQuickSettingsDraft({ effortLevel: 'high' }, { effortLevel: 'max' })).toEqual({
      env: { CLAUDE_CODE_EFFORT_LEVEL: 'max' },
    })
    expect(applyQuickSettingsDraft({ env: { FOO: 'bar' } }, { effortLevel: 'max' })).toEqual({
      env: { FOO: 'bar', CLAUDE_CODE_EFFORT_LEVEL: 'max' },
    })
  })

  it('clears the max env override when switching to a persistable effort level', () => {
    expect(
      applyQuickSettingsDraft({ env: { CLAUDE_CODE_EFFORT_LEVEL: 'max' } }, { effortLevel: 'high' }),
    ).toEqual({ effortLevel: 'high' })
    expect(
      applyQuickSettingsDraft({ env: { CLAUDE_CODE_EFFORT_LEVEL: 'max', FOO: 'bar' } }, { effortLevel: 'low' }),
    ).toEqual({ effortLevel: 'low', env: { FOO: 'bar' } })
  })

  it('reads an effort level from the env var override before the effortLevel setting', () => {
    const state = createSettingsSelectFlowState({
      items: [{
        name: 'base',
        settings: { effortLevel: 'high', env: { CLAUDE_CODE_EFFORT_LEVEL: 'max' } },
        sourcePath: '/tmp/base.json',
      }],
    })
    expect(resolveQuickSettingDisplays(state)[1]).toMatchObject({ value: 'max', source: 'preset' })
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

  it('allows editing the temporary Claude Official settings', () => {
    let state = createSettingsSelectFlowState({ items })
    state = reduceSettingsSelectFlow(state, { type: 'focus-right' })
    state = reduceSettingsSelectFlow(state, { type: 'cycle-current' })

    expect(state.draftsByPreset).toEqual({ '*Claude Official*': { defaultMode: 'acceptEdits' } })
  })
})
