import { describe, expect, it } from 'vitest'
import { indexSchema, settingsSchema } from '../../src/core/schema.js'

describe('settingsSchema', () => {
  it('accepts a loose Claude settings object with plugin and skill fields', () => {
    const parsed = settingsSchema.parse({
      model: 'claude-sonnet-4-6',
      enabledPlugins: {
        'superpowers@claude-plugins-official': true,
        'legacy-plugin': false,
      },
      skillOverrides: {
        'legacy-context': 'off',
        deploy: 'name-only',
      },
    })

    expect(parsed.enabledPlugins?.['superpowers@claude-plugins-official']).toBe(true)
    expect(parsed.skillOverrides?.deploy).toBe('name-only')
    expect(parsed.model).toBe('claude-sonnet-4-6')
  })

  it('rejects non-object settings files', () => {
    expect(() => settingsSchema.parse([])).toThrow()
    expect(() => settingsSchema.parse('bad')).toThrow()
  })

  it('rejects unsupported skill override values', () => {
    expect(() => settingsSchema.parse({ skillOverrides: { demo: 'disabled' } })).toThrow()
  })
})

describe('indexSchema', () => {
  it('accepts first-level and derived preset metadata', () => {
    const parsed = indexSchema.parse({
      version: 1,
      presets: {
        base: {
          type: 'base',
          name: 'base',
          fileName: 'base-settings.json',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
        'base-work': {
          type: 'derived',
          name: 'base-work',
          parentName: 'base',
          fileName: 'base-work-settings.json',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:00:00.000Z',
        },
      },
    })

    expect(parsed.presets.base?.type).toBe('base')
    expect(parsed.presets['base-work']?.type).toBe('derived')
  })
})
