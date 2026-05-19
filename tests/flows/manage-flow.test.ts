import { describe, expect, it } from 'vitest'
import { reduceManageMode } from '../../src/flows/manage-flow.js'

describe('manage flow', () => {
  it('enters rename and delete confirmation modes', () => {
    expect(reduceManageMode('browsing', { type: 'rename' })).toBe('renaming')
    expect(reduceManageMode('browsing', { type: 'delete' })).toBe('confirm-delete')
  })

  it('returns to browsing on escape', () => {
    expect(reduceManageMode('confirm-delete', { type: 'escape' })).toBe('browsing')
  })
})
