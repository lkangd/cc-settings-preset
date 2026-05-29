import { describe, expect, it } from 'vitest'
import type { CcspConfig } from '../../src/core/schema.js'
import {
  CONFIG_OPTIONS,
  createConfigFlowState,
  reduceConfigFlow,
} from '../../src/flows/config-flow.js'

const defaultConfig: CcspConfig = {
  globalPresetEnvOnly: true,
  statusLineEnabled: true,
  settingsDisplayFormat: 'yaml',
}

describe('config flow', () => {
  it('starts at the first option', () => {
    expect(createConfigFlowState(defaultConfig).cursor).toBe(0)
  })

  it('moves within the option list and clamps at the edges', () => {
    const state = createConfigFlowState(defaultConfig)
    expect(reduceConfigFlow(state, { type: 'up' }).cursor).toBe(0)

    let cursor = state
    for (let i = 0; i < CONFIG_OPTIONS.length + 2; i += 1) {
      cursor = reduceConfigFlow(cursor, { type: 'down' })
    }
    expect(cursor.cursor).toBe(CONFIG_OPTIONS.length - 1)
  })

  it('flips a boolean option under the cursor without touching others', () => {
    const state = createConfigFlowState(defaultConfig)

    const toggledFirst = reduceConfigFlow(state, { type: 'toggle' })
    expect(toggledFirst.config).toEqual({ ...defaultConfig, globalPresetEnvOnly: false })

    const moved = reduceConfigFlow(toggledFirst, { type: 'down' })
    const toggledSecond = reduceConfigFlow(moved, { type: 'toggle' })
    expect(toggledSecond.config).toEqual({
      ...defaultConfig,
      globalPresetEnvOnly: false,
      statusLineEnabled: false,
    })
  })

  it('cycles the settings display format enum option', () => {
    const formatIndex = CONFIG_OPTIONS.findIndex(option => option.key === 'settingsDisplayFormat')
    let state = createConfigFlowState(defaultConfig)
    for (let i = 0; i < formatIndex; i += 1) {
      state = reduceConfigFlow(state, { type: 'down' })
    }

    const toJson = reduceConfigFlow(state, { type: 'toggle' })
    expect(toJson.config.settingsDisplayFormat).toBe('json')

    const backToYaml = reduceConfigFlow(toJson, { type: 'toggle' })
    expect(backToYaml.config.settingsDisplayFormat).toBe('yaml')
  })

  it('reports value display per option', () => {
    const [first] = CONFIG_OPTIONS
    expect(first?.display(defaultConfig)).toEqual({ label: 'enable', tone: 'on' })

    const formatOption = CONFIG_OPTIONS.find(option => option.key === 'settingsDisplayFormat')
    expect(formatOption?.display(defaultConfig)).toEqual({ label: 'yaml', tone: 'info' })
  })
})
