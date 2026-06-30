import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTextInput } from '../../src/ink/components/use-text-input.js'
import type { TextInputState } from '../../src/ink/components/use-text-input-state.js'

type InputKey = {
  backspace?: boolean
  delete?: boolean
  meta?: boolean
  super?: boolean
}

type InputHandler = (input: string, key: InputKey) => void

let inputHandler: InputHandler | undefined

vi.mock('ink', () => ({
  useInput: (handler: InputHandler) => {
    inputHandler = handler
  },
}))

function TextInputHarness({ state }: { state: TextInputState }) {
  const value = useTextInput({ state })
  return React.createElement('text-input-output', { value })
}

function createTextInputState(): TextInputState {
  return {
    previousValue: 'ac',
    value: 'abc',
    cursorOffset: 2,
    moveCursorLeft: vi.fn(),
    moveCursorRight: vi.fn(),
    moveCursorToStart: vi.fn(),
    moveCursorToEnd: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    deleteToStart: vi.fn(),
    deleteToEnd: vi.fn(),
    deleteWordBackward: vi.fn(),
    submit: vi.fn(),
  }
}

describe('useTextInput', () => {
  beforeEach(() => {
    inputHandler = undefined
  })

  it.each([
    ['super backspace', { super: true, backspace: true }],
    ['meta delete', { meta: true, delete: true }],
  ] satisfies Array<[string, InputKey]>)('deletes from the cursor to the start on command backspace parsed as %s', (_name, key) => {
    const state = createTextInputState()

    act(() => {
      TestRenderer.create(React.createElement(TextInputHarness, { state }))
    })

    act(() => {
      inputHandler?.('', key)
    })

    expect(state.deleteToStart).toHaveBeenCalledOnce()
    expect(state.delete).not.toHaveBeenCalled()
  })
})
