import { describe, expect, it } from 'vitest'

import { reduceTextInputState } from '../../src/ink/components/use-text-input-state.js'

describe('reduceTextInputState', () => {
  it('deletes from cursor to line start on delete-to-start', () => {
    const next = reduceTextInputState(
      { previousValue: '', value: '/path/to/file.json', cursorOffset: 9 },
      { type: 'delete-to-start' },
    )
    expect(next.value).toBe('file.json')
    expect(next.cursorOffset).toBe(0)
  })

  it('clears the whole line when delete-to-start is used at end of line', () => {
    const next = reduceTextInputState(
      { previousValue: '', value: '/path/to/file.json', cursorOffset: 18 },
      { type: 'delete-to-start' },
    )
    expect(next.value).toBe('')
    expect(next.cursorOffset).toBe(0)
  })

  it('deletes from cursor to line end on delete-to-end', () => {
    const next = reduceTextInputState(
      { previousValue: '', value: '/path/to/file.json', cursorOffset: 9 },
      { type: 'delete-to-end' },
    )
    expect(next.value).toBe('/path/to/')
    expect(next.cursorOffset).toBe(9)
  })

  it('deletes the previous word on delete-word-backward', () => {
    const next = reduceTextInputState(
      { previousValue: '', value: 'hello world', cursorOffset: 11 },
      { type: 'delete-word-backward' },
    )
    expect(next.value).toBe('hello ')
    expect(next.cursorOffset).toBe(6)
  })
})
