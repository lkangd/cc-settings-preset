import { describe, expect, it } from 'vitest'
import { createRunFlowState, reduceRunFlow } from '../../src/flows/run-flow.js'

describe('run flow', () => {
  const state = createRunFlowState({
    presets: [
      { type: 'base', name: 'base', fileName: 'base-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
    ],
    plugins: [{ name: 'alpha', enabled: true, source: 'user' }],
    skills: [{ name: 'legacy', enabled: true, source: 'user', toggleable: true }],
  })

  it('moves focus between settings, plugins, and skills', () => {
    expect(reduceRunFlow(state, { type: 'focus-plugins' }).focus).toBe('plugins')
    expect(reduceRunFlow(state, { type: 'focus-skills' }).focus).toBe('skills')
    expect(reduceRunFlow({ ...state, focus: 'skills' }, { type: 'escape' }).focus).toBe('settings')
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
})
