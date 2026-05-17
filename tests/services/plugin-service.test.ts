import { describe, expect, it } from 'vitest'
import { resolvePluginStates } from '../../src/services/plugin-service.js'

describe('resolvePluginStates', () => {
  it('uses the first source as the highest precedence value', () => {
    const plugins = resolvePluginStates([
      { scope: 'project-local', filePath: 'local', settings: { enabledPlugins: { alpha: false } } },
      { scope: 'project', filePath: 'project', settings: { enabledPlugins: { alpha: true, beta: true } } },
      { scope: 'user', filePath: 'user', settings: { enabledPlugins: { gamma: true } } },
    ])

    expect(plugins).toEqual([
      { name: 'beta', enabled: true, source: 'project' },
      { name: 'gamma', enabled: true, source: 'user' },
      { name: 'alpha', enabled: false, source: 'project-local' },
    ])
  })
})
