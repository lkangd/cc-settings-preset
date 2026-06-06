import { describe, expect, it } from 'vitest'
import {
  cycleSortMode,
  moveListCursor,
  remapCursorByKey,
} from '../../src/flows/sortable-list-flow.js'

describe('sortable list flow', () => {
  it('cycles sort modes in declaration order', () => {
    const modes = ['recent', 'name', 'updated'] as const

    expect(cycleSortMode(modes, 'recent')).toBe('name')
    expect(cycleSortMode(modes, 'name')).toBe('updated')
    expect(cycleSortMode(modes, 'updated')).toBe('recent')
  })

  it('moves the cursor within bounds', () => {
    expect(moveListCursor(0, 3, 1)).toBe(1)
    expect(moveListCursor(2, 3, 1)).toBe(2)
    expect(moveListCursor(0, 3, -1)).toBe(0)
  })

  it('keeps the same selected item after resorting when the key still exists', () => {
    const previous = [{ name: 'b' }, { name: 'a' }, { name: 'c' }]
    const next = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]

    expect(remapCursorByKey(previous, next, 0, item => item.name)).toBe(1)
  })
})
