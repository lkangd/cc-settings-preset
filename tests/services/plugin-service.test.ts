import { describe, expect, it } from 'vitest'
import { applyPluginOverrides, pluginStatesToEnabledPlugins, resolvePluginStates } from '../../src/services/plugin-service.js'

describe('resolvePluginStates', () => {
  it('uses higher-priority settings sources to override lower-priority ones', () => {
    const plugins = resolvePluginStates([
      { scope: 'project-local', filePath: 'local', settings: { enabledPlugins: { alpha: false, gamma: true } } },
      { scope: 'project', filePath: 'project', settings: { enabledPlugins: { beta: false } } },
      { scope: 'user', filePath: 'user', settings: { enabledPlugins: { alpha: true, beta: true } } },
    ])

    expect(plugins).toEqual([
      { name: 'gamma', enabled: true, source: 'project-local' },
      { name: 'alpha', enabled: false, source: 'project-local' },
      { name: 'beta', enabled: false, source: 'project' },
    ])
  })
})

describe('pluginStatesToEnabledPlugins', () => {
  it('only records disabled plugins as false', () => {
    expect(pluginStatesToEnabledPlugins([
      { name: 'alpha', enabled: true, source: 'user' },
      { name: 'beta', enabled: false, source: 'project' },
    ])).toEqual({ beta: false })
  })
})

describe('launch plugin helpers', () => {
  it('applies project launch plugin overrides', () => {
    expect(applyPluginOverrides([
      { name: 'alpha', enabled: true, source: 'user' },
      { name: 'beta', enabled: true, source: 'project' },
    ], { alpha: false })).toEqual([
      { name: 'beta', enabled: true, source: 'project' },
      { name: 'alpha', enabled: false, source: 'user' },
    ])
  })
})
