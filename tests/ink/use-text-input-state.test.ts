import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'

import { reduceTextInputState, useTextInputState } from '../../src/ink/components/use-text-input-state.js'

function StateView(props: { value: string; cursorOffset: number }) {
  return React.createElement('state-view', props)
}

function StateHarness({ defaultValue }: { defaultValue: string }) {
  const state = useTextInputState({ defaultValue })
  return React.createElement(StateView, { value: state.value, cursorOffset: state.cursorOffset })
}

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

describe('useTextInputState', () => {
  it('syncs to a new default value when the parent switches inputs', () => {
    const manualPath = '/Users/liangkangda/.claude/settings.json'
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(React.createElement(StateHarness, { defaultValue: manualPath }))
    })

    expect(output!.root.findByType(StateView).props.value).toBe(manualPath)
    expect(output!.root.findByType(StateView).props.cursorOffset).toBe(manualPath.length)

    act(() => {
      output!.update(React.createElement(StateHarness, { defaultValue: 'settings' }))
    })

    expect(output!.root.findByType(StateView).props.value).toBe('settings')
    expect(output!.root.findByType(StateView).props.cursorOffset).toBe('settings'.length)
  })
})
