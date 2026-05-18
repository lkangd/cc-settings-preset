import { describe, expect, it } from 'vitest'
import { createRunFlowState, reduceRunFlow, shouldShowDerivedHint } from '../../src/flows/run-flow.js'

describe('run flow', () => {
  const state = createRunFlowState({
    presets: [
      { type: 'base', name: 'base', fileName: 'base-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
    ],
    plugins: [
      { name: 'alpha', enabled: true, source: 'user' },
      { name: 'beta', enabled: false, source: 'project' },
    ],
    skills: [
      { name: 'legacy', enabled: true, source: 'user', toggleable: true },
      { name: 'archive', enabled: false, source: 'project', toggleable: true },
    ],
  })

  it('moves focus between settings, plugins, and skills', () => {
    expect(reduceRunFlow(state, { type: 'focus-plugins' }).focus).toBe('plugins')
    expect(reduceRunFlow(state, { type: 'focus-skills' }).focus).toBe('skills')
    expect(reduceRunFlow({ ...state, focus: 'skills' }, { type: 'escape' }).focus).toBe('settings')
  })

  it('moves focus left and right across columns', () => {
    expect(reduceRunFlow(state, { type: 'focus-right' }).focus).toBe('plugins')
    expect(reduceRunFlow({ ...state, focus: 'plugins' }, { type: 'focus-right' }).focus).toBe('skills')
    expect(reduceRunFlow({ ...state, focus: 'skills' }, { type: 'focus-left' }).focus).toBe('plugins')
    expect(reduceRunFlow({ ...state, focus: 'plugins' }, { type: 'focus-left' }).focus).toBe('settings')
  })

  it('toggles plugin and skill state', () => {
    const pluginState = reduceRunFlow({ ...state, focus: 'plugins' }, { type: 'toggle-current' })
    expect(pluginState.plugins[0]?.enabled).toBe(false)

    const skillState = reduceRunFlow({ ...state, focus: 'skills' }, { type: 'toggle-current' })
    expect(skillState.skills[0]?.enabled).toBe(false)
    expect(skillState.dirty).toBe(true)
  })

  it('does not toggle non-toggleable plugin skills', () => {
    const next = reduceRunFlow({
      ...state,
      focus: 'skills',
      skills: [{ name: 'plugin:skill', enabled: true, source: 'plugin', toggleable: false, controlledByPlugin: 'plugin' }],
    }, { type: 'toggle-current' })

    expect(next.skills[0]?.enabled).toBe(true)
    expect(next.dirty).toBe(false)
  })

  it('toggles sort mode between status and name order', () => {
    const sortedByName = reduceRunFlow(state, { type: 'toggle-sort-mode' })
    expect(sortedByName.sortMode).toBe('name')
    expect(sortedByName.plugins.map(plugin => plugin.name)).toEqual(['alpha', 'beta'])
    expect(sortedByName.skills.map(skill => skill.name)).toEqual(['archive', 'legacy'])

    const sortedByStatus = reduceRunFlow(sortedByName, { type: 'toggle-sort-mode' })
    expect(sortedByStatus.sortMode).toBe('status')
    expect(sortedByStatus.plugins.map(plugin => [plugin.name, plugin.enabled])).toEqual([
      ['alpha', true],
      ['beta', false],
    ])
    expect(sortedByStatus.skills.map(skill => [skill.name, skill.enabled])).toEqual([
      ['legacy', true],
      ['archive', false],
    ])
  })

  it('re-sorts plugins and skills after toggle in status mode', () => {
    const pluginState = reduceRunFlow({ ...state, focus: 'plugins' }, { type: 'toggle-current' })
    expect(pluginState.plugins.map(plugin => [plugin.name, plugin.enabled])).toEqual([
      ['alpha', false],
      ['beta', false],
    ])

    const skillState = reduceRunFlow({ ...state, focus: 'skills' }, { type: 'toggle-current' })
    expect(skillState.skills.map(skill => [skill.name, skill.enabled])).toEqual([
      ['legacy', false],
      ['archive', false],
    ])
  })

  it('keeps a draft per preset when switching after edits', () => {
    const state = createRunFlowState({
      presets: [
        { type: 'base', name: 'a', fileName: 'a-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        { type: 'base', name: 'b', fileName: 'b-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
      ],
      pluginsByPreset: {
        a: [{ name: 'alpha', enabled: true, source: 'user' }],
        b: [{ name: 'alpha', enabled: false, source: 'project' }],
      },
      skillsByPreset: {
        a: [{ name: 'personal', enabled: true, source: 'user', toggleable: true }],
        b: [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
      },
    })

    const editedA = reduceRunFlow({ ...state, focus: 'plugins' }, { type: 'toggle-current' })
    const focusedSettings = reduceRunFlow(editedA, { type: 'focus-left' })
    const movedToB = reduceRunFlow(focusedSettings, { type: 'down' })

    expect(movedToB.settingsCursor).toBe(1)
    expect(movedToB.plugins[0]?.name).toBe('alpha')
    expect(movedToB.plugins[0]?.enabled).toBe(false)
    expect(movedToB.skills[0]?.name).toBe('personal')
    expect(movedToB.skills[0]?.enabled).toBe(false)

    const backToA = reduceRunFlow(movedToB, { type: 'up' })
    expect(backToA.plugins[0]?.name).toBe('alpha')
    expect(backToA.plugins[0]?.enabled).toBe(false)
    expect(backToA.skills[0]?.name).toBe('personal')
    expect(backToA.skills[0]?.enabled).toBe(true)
  })

  it('only shows the derived hint for a base preset with an active draft', () => {
    const state = createRunFlowState({
      presets: [
        { type: 'base', name: 'base', fileName: 'base.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
        { type: 'derived', name: 'base-work', parentName: 'base', fileName: 'base-work.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
      ],
      pluginsByPreset: {
        base: [{ name: 'alpha', enabled: true, source: 'user' }],
        'base-work': [{ name: 'alpha', enabled: false, source: 'project' }],
      },
      skillsByPreset: {
        base: [{ name: 'personal', enabled: true, source: 'user', toggleable: true }],
        'base-work': [{ name: 'personal', enabled: false, source: 'user', toggleable: true }],
      },
    })

    const selectedDerived = reduceRunFlow(state, { type: 'down' })
    const focusedPlugins = reduceRunFlow({ ...selectedDerived, focus: 'settings' }, { type: 'focus-right' })
    const editedDerived = reduceRunFlow(focusedPlugins, { type: 'toggle-current' })

    expect(shouldShowDerivedHint(editedDerived)).toBe(false)
  })
})
