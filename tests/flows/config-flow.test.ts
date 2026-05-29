import { describe, expect, it } from 'vitest'
import {
  CONFIG_OPTIONS,
  createConfigFlowState,
  reduceConfigFlow,
} from '../../src/flows/config-flow.js'

const defaultConfig = { globalPresetEnvOnly: true, statusLineEnabled: true }

describe('config flow', () => {
  it('starts at the first option', () => {
    expect(createConfigFlowState(defaultConfig).cursor).toBe(0)
  })

  it('moves within the option list and clamps at the edges', () => {
    const state = createConfigFlowState(defaultConfig)
    expect(reduceConfigFlow(state, { type: 'up' }).cursor).toBe(0)

    const down = reduceConfigFlow(state, { type: 'down' })
    expect(down.cursor).toBe(1)
    expect(reduceConfigFlow(down, { type: 'down' }).cursor).toBe(CONFIG_OPTIONS.length - 1)
  })

  it('toggles the option under the cursor without touching others', () => {
    const state = createConfigFlowState(defaultConfig)

    const toggledFirst = reduceConfigFlow(state, { type: 'toggle' })
    expect(toggledFirst.config).toEqual({ globalPresetEnvOnly: false, statusLineEnabled: true })

    const moved = reduceConfigFlow(toggledFirst, { type: 'down' })
    const toggledSecond = reduceConfigFlow(moved, { type: 'toggle' })
    expect(toggledSecond.config).toEqual({ globalPresetEnvOnly: false, statusLineEnabled: false })
  })
})
