import { describe, expect, it } from 'vitest'
import { createProjectLaunchFlowState, reduceProjectLaunchFlow } from '../../src/flows/project-launch-flow.js'

const input = {
  presets: [{ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }],
  detected: {
    plugins: [{ name: 'alpha', enabled: true, source: 'user' as const }],
    skills: [{ name: 'personal', enabled: true, source: 'user' as const, toggleable: true }],
    mcps: [{ name: 'github', enabled: true, source: 'project' as const, config: {} }],
  },
  statesByPreset: {
    web: {
      plugins: [{ name: 'alpha', enabled: false, source: 'user' as const }],
      skills: [{ name: 'personal', enabled: false, source: 'user' as const, toggleable: true }],
      mcps: [{ name: 'github', enabled: false, source: 'project' as const, config: {} }],
    },
  },
}

describe('project launch flow', () => {
  it('selects last-used preset when available', () => {
    expect(createProjectLaunchFlowState({ ...input, lastUsedName: 'web' }).presetCursor).toBe(1)
  })

  it('falls back to Detected when last-used is missing', () => {
    expect(createProjectLaunchFlowState({ ...input, lastUsedName: 'missing' }).presetCursor).toBe(0)
  })

  it('toggles MCP state and marks the flow dirty', () => {
    const state = createProjectLaunchFlowState(input)
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-mcps' })
    const toggled = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })

    expect(toggled.mcps[0]?.enabled).toBe(false)
    expect(toggled.dirty).toBe(true)
  })
})
