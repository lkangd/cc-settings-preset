import { describe, expect, it } from 'vitest'
import { createManageFlowState, reduceManageFlow } from '../../src/flows/manage-flow.js'

describe('manage flow', () => {
  const presets = [
    { type: 'base' as const, name: 'base', fileName: 'base-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
    { type: 'derived' as const, name: 'base-work', parentName: 'base', fileName: 'base-work-settings.json', createdAt: '2026-05-17T00:00:00.000Z', updatedAt: '2026-05-17T00:00:00.000Z' },
  ]

  it('moves cursor', () => {
    const state = reduceManageFlow(createManageFlowState(presets), { type: 'down' })
    expect(state.cursor).toBe(1)
  })

  it('enters rename and delete confirmation modes', () => {
    expect(reduceManageFlow(createManageFlowState(presets), { type: 'rename' }).mode).toBe('renaming')
    expect(reduceManageFlow(createManageFlowState(presets), { type: 'delete' }).mode).toBe('confirm-delete')
  })

  it('returns to browsing on escape', () => {
    const deleting = reduceManageFlow(createManageFlowState(presets), { type: 'delete' })
    expect(reduceManageFlow(deleting, { type: 'escape' }).mode).toBe('browsing')
  })
})
