import { describe, expect, it } from 'vitest'
import {
  createSettingsSelectFlowState,
  reduceSettingsSelectFlow,
} from '../../src/flows/settings-select-flow.js'

describe('settings select flow', () => {
  const items = [
    {
      name: '*Claude Official*',
      settings: {},
      sourcePath: '/tmp/official.json',
      temporary: true as const,
    },
    {
      name: 'beta',
      settings: {},
      sourcePath: '/tmp/beta.json',
      updatedAt: '2026-06-02T00:00:00.000Z',
    },
    {
      name: 'alpha',
      settings: {},
      sourcePath: '/tmp/alpha.json',
      updatedAt: '2026-06-03T00:00:00.000Z',
      isLastUsed: true,
    },
  ]

  it('starts with recent sort and keeps temporary items pinned first', () => {
    const state = createSettingsSelectFlowState({ items })
    expect(state.sortMode).toBe('recent')
    expect(state.items.map(item => item.name)).toEqual([
      '*Claude Official*',
      'alpha',
      'beta',
    ])
  })

  it('cycles to name sort and keeps the selected item stable', () => {
    const state = createSettingsSelectFlowState({ items, initialName: 'beta' })
    const sorted = reduceSettingsSelectFlow(state, { type: 'toggle-sort-mode' })

    expect(sorted.sortMode).toBe('name')
    expect(sorted.items.map(item => item.name)).toEqual([
      '*Claude Official*',
      'alpha',
      'beta',
    ])
    expect(sorted.items[sorted.cursor]?.name).toBe('beta')
  })

  it('cycles to updated sort with newest normal preset first', () => {
    const state = reduceSettingsSelectFlow(
      reduceSettingsSelectFlow(createSettingsSelectFlowState({ items }), { type: 'toggle-sort-mode' }),
      { type: 'toggle-sort-mode' },
    )

    expect(state.sortMode).toBe('updated')
    expect(state.items.map(item => item.name)).toEqual([
      '*Claude Official*',
      'alpha',
      'beta',
    ])
  })
})
