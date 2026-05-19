import { describe, expect, it } from 'vitest'
import { createSettingsSelectFlowState, reduceSettingsSelectFlow } from '../../src/flows/settings-select-flow.js'

describe('settings select flow', () => {
  const items = [
    { name: 'base', settings: { enabledPlugins: { alpha: true } }, sourcePath: '/tmp/base.json' },
    { name: 'work', settings: { permissions: { allow: ['Read(*)'] } }, sourcePath: '/tmp/work.json' },
  ]

  it('starts on the requested initial item', () => {
    expect(createSettingsSelectFlowState({ items, initialName: 'work' }).cursor).toBe(1)
  })

  it('moves within the settings list', () => {
    const state = createSettingsSelectFlowState({ items })
    expect(reduceSettingsSelectFlow(state, { type: 'down' }).cursor).toBe(1)
    expect(reduceSettingsSelectFlow(state, { type: 'up' }).cursor).toBe(0)
  })
})
