import { describe, expect, it } from 'vitest'
import {
  annotateToggleItems,
  createProjectLaunchFlowState,
  getPendingDisableRemovals,
  reduceProjectLaunchFlow,
  shouldBubbleProjectLaunchEscape,
} from '../../src/flows/project-launch-flow.js'

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

  it('returns to presets on escape before bubbling', () => {
    const state = reduceProjectLaunchFlow(createProjectLaunchFlowState(input), { type: 'focus-right' })

    expect(shouldBubbleProjectLaunchEscape(state)).toBe(false)
    expect(reduceProjectLaunchFlow(state, { type: 'escape' }).focus).toBe('presets')
  })

  it('bubbles escape when already focused on presets', () => {
    const state = createProjectLaunchFlowState(input)

    expect(shouldBubbleProjectLaunchEscape(state)).toBe(true)
  })

  it('toggles MCP state and marks the flow dirty', () => {
    const state = createProjectLaunchFlowState(input)
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-mcps' })
    const toggled = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })

    expect(toggled.mcps[0]?.enabled).toBe(false)
    expect(toggled.dirty).toBe(true)
  })

  it('requests unlock confirmation when disable lock source is known', () => {
    const state = createProjectLaunchFlowState({
      ...input,
      detected: {
        plugins: [{ name: 'alpha', enabled: false, source: 'project-local' }],
        skills: [],
        mcps: [],
      },
      statesByPreset: {
        web: {
          plugins: [{ name: 'alpha', enabled: false, source: 'project-local' }],
          skills: [],
          mcps: [],
        },
      },
      disableLockSources: [
        { scope: 'project-local', filePath: '/tmp/.claude/settings.local.json', settings: { enabledPlugins: { alpha: false } } },
      ],
    })
    const onPreset = reduceProjectLaunchFlow(state, { type: 'down' })
    const focused = reduceProjectLaunchFlow(onPreset, { type: 'focus-plugins' })
    const blocked = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })

    expect(blocked.plugins[0]?.enabled).toBe(false)
    expect(blocked.pendingEnableUnlock).toEqual({
      kind: 'plugins',
      name: 'alpha',
      filePath: '/tmp/.claude/settings.local.json',
    })
    expect(blocked.dirty).toBe(false)
  })

  it('falls back to toggle message when disable lock source is unknown', () => {
    const state = createProjectLaunchFlowState({
      ...input,
      detected: {
        plugins: [{ name: 'alpha', enabled: false, source: 'project-local' }],
        skills: [],
        mcps: [],
      },
      statesByPreset: {},
      disableLockSources: [],
    })
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-plugins' })
    const blocked = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })

    expect(blocked.toggleMessage).toContain('local project')
    expect(blocked.pendingEnableUnlock).toBeUndefined()
  })

  it('marks removal and enables item after confirm-enable-unlock', () => {
    const state = createProjectLaunchFlowState({
      ...input,
      detected: {
        plugins: [{ name: 'alpha', enabled: false, source: 'project-local' }],
        skills: [],
        mcps: [],
      },
      statesByPreset: {},
      disableLockSources: [
        { scope: 'project-local', filePath: '/tmp/settings.local.json', settings: { enabledPlugins: { alpha: false } } },
      ],
    })
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-plugins' })
    const pending = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })
    const confirmed = reduceProjectLaunchFlow(pending, { type: 'confirm-enable-unlock' })

    expect(confirmed.plugins[0]?.enabled).toBe(true)
    expect(getPendingDisableRemovals(confirmed)).toEqual([
      { kind: 'plugins', name: 'alpha', filePath: '/tmp/settings.local.json' },
    ])
    expect(confirmed.pendingEnableUnlock).toBeUndefined()
    expect(confirmed.dirty).toBe(true)
  })

  it('clears pending unlock on cancel-enable-unlock', () => {
    const state = createProjectLaunchFlowState({
      ...input,
      detected: {
        plugins: [{ name: 'alpha', enabled: false, source: 'project-local' }],
        skills: [],
        mcps: [],
      },
      statesByPreset: {},
      disableLockSources: [
        { scope: 'project-local', filePath: '/tmp/settings.local.json', settings: { enabledPlugins: { alpha: false } } },
      ],
    })
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-plugins' })
    const pending = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })
    const cancelled = reduceProjectLaunchFlow(pending, { type: 'cancel-enable-unlock' })

    expect(cancelled.pendingEnableUnlock).toBeUndefined()
    expect(cancelled.plugins[0]?.enabled).toBe(false)
    expect(getPendingDisableRemovals(cancelled)).toEqual([])
  })

  it('requests plugin enable confirmation when toggling a plugin-controlled MCP', () => {
    const state = createProjectLaunchFlowState({
      presets: [],
      detected: {
        plugins: [{ name: 'devtools@plugins', enabled: false, source: 'user' }],
        skills: [],
        mcps: [{
          name: 'chrome-devtools',
          enabled: false,
          source: 'plugin',
          config: {},
          controlledByPlugin: 'devtools@plugins',
        }],
      },
      statesByPreset: {},
      disableLockSources: [
        { scope: 'user', filePath: '/tmp/settings.json', settings: { enabledPlugins: { 'devtools@plugins': false } } },
      ],
    })
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-mcps' })
    const blocked = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })

    expect(blocked.pendingEnableUnlock).toEqual({
      kind: 'mcps',
      name: 'chrome-devtools',
      requiredPlugin: 'devtools@plugins',
      filePath: '/tmp/settings.json',
    })
  })

  it('enables plugin and MCP after confirming plugin-controlled MCP unlock', () => {
    const state = createProjectLaunchFlowState({
      presets: [],
      detected: {
        plugins: [{ name: 'devtools@plugins', enabled: false, source: 'user' }],
        skills: [],
        mcps: [{
          name: 'chrome-devtools',
          enabled: false,
          source: 'plugin',
          config: {},
          controlledByPlugin: 'devtools@plugins',
        }],
      },
      statesByPreset: {},
      disableLockSources: [
        { scope: 'user', filePath: '/tmp/settings.json', settings: { enabledPlugins: { 'devtools@plugins': false } } },
      ],
    })
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-mcps' })
    const pending = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })
    const confirmed = reduceProjectLaunchFlow(pending, { type: 'confirm-enable-unlock' })

    expect(confirmed.plugins[0]?.enabled).toBe(true)
    expect(confirmed.mcps[0]?.enabled).toBe(true)
    expect(getPendingDisableRemovals(confirmed)).toEqual([
      { kind: 'plugins', name: 'devtools@plugins', filePath: '/tmp/settings.json' },
    ])
  })

  it('disables plugin-controlled MCPs when the parent plugin is toggled off', () => {
    const state = createProjectLaunchFlowState({
      presets: [],
      detected: {
        plugins: [{ name: 'devtools@plugins', enabled: true, source: 'user' }],
        skills: [],
        mcps: [{
          name: 'chrome-devtools',
          enabled: true,
          source: 'plugin',
          config: {},
          controlledByPlugin: 'devtools@plugins',
        }],
      },
      statesByPreset: {},
    })
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-plugins' })
    const toggled = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })

    expect(toggled.plugins[0]?.enabled).toBe(false)
    expect(toggled.mcps[0]?.enabled).toBe(false)
  })

  it('treats marked removals as unlocked in annotations', () => {
    const state = createProjectLaunchFlowState({
      ...input,
      detected: {
        plugins: [{ name: 'alpha', enabled: false, source: 'project-local' }],
        skills: [],
        mcps: [],
      },
      statesByPreset: {},
      disableLockSources: [
        { scope: 'project-local', filePath: '/tmp/settings.local.json', settings: { enabledPlugins: { alpha: false } } },
      ],
    })
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-plugins' })
    const pending = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })
    const confirmed = reduceProjectLaunchFlow(pending, { type: 'confirm-enable-unlock' })
    const detected = confirmed.statesByPreset.Detected ?? { plugins: [], skills: [], mcps: [] }
    const annotated = annotateToggleItems(confirmed, detected, 'plugins', confirmed.plugins)

    expect(annotated[0]?.enableLocked).toBe(false)
  })

  it('pins externally disabled items to the bottom in status and name sort modes', () => {
    const state = createProjectLaunchFlowState({
      presets: [],
      detected: {
        plugins: [
          { name: 'zeta', enabled: false, source: 'project-local' },
          { name: 'alpha', enabled: true, source: 'user' },
          { name: 'beta', enabled: false, source: 'project' },
        ],
        skills: [],
        mcps: [],
      },
      statesByPreset: {},
    })

    expect(state.plugins.map(plugin => plugin.name)).toEqual(['alpha', 'beta', 'zeta'])

    const nameSorted = reduceProjectLaunchFlow(state, { type: 'toggle-sort-mode' })
    expect(nameSorted.plugins.map(plugin => plugin.name)).toEqual(['alpha', 'beta', 'zeta'])
  })

  it('still allows disabling items that are currently enabled', () => {
    const state = createProjectLaunchFlowState(input)
    const focused = reduceProjectLaunchFlow(state, { type: 'focus-plugins' })
    const toggled = reduceProjectLaunchFlow(focused, { type: 'toggle-current' })

    expect(toggled.plugins[0]?.enabled).toBe(false)
    expect(toggled.dirty).toBe(true)
  })
})
