import chalk from 'chalk'
import { useInput } from 'ink'
import { useMemo } from 'react'

import type { TextInputState } from './use-text-input-state.js'

const cursor = chalk.inverse(' ')

type UseTextInputProps = {
  state: TextInputState
  placeholder?: string
  isDisabled?: boolean
}

export function useTextInput({
  state,
  placeholder = '',
  isDisabled = false,
}: UseTextInputProps): string {
  const renderedPlaceholder = useMemo(() => {
    if (isDisabled) {
      return placeholder ? chalk.dim(placeholder) : ''
    }
    return placeholder.length > 0
      ? chalk.inverse(placeholder[0]) + chalk.dim(placeholder.slice(1))
      : cursor
  }, [isDisabled, placeholder])

  const renderedValue = useMemo(() => {
    if (isDisabled) {
      return state.value
    }

    let index = 0
    let result = state.value.length > 0 ? '' : cursor

    for (const char of state.value) {
      result += index === state.cursorOffset ? chalk.inverse(char) : char
      index++
    }

    if (state.value.length > 0 && state.cursorOffset === state.value.length) {
      result += cursor
    }

    return result
  }, [isDisabled, state.value, state.cursorOffset])

  useInput((input, key) => {
    if (
      key.upArrow ||
      key.downArrow ||
      (key.ctrl && input === 'c') ||
      key.tab ||
      (key.shift && key.tab)
    ) {
      return
    }

    if (key.return) {
      state.submit()
      return
    }

    if (key.ctrl) {
      switch (input) {
        case 'u':
          state.deleteToStart()
          return
        case 'k':
          state.deleteToEnd()
          return
        case 'w':
          state.deleteWordBackward()
          return
        case 'a':
          state.moveCursorToStart()
          return
        case 'e':
          state.moveCursorToEnd()
          return
      }
      return
    }

    if (key.home) {
      state.moveCursorToStart()
      return
    }

    if (key.end) {
      state.moveCursorToEnd()
      return
    }

    if (key.leftArrow) {
      state.moveCursorLeft()
      return
    }

    if (key.rightArrow) {
      state.moveCursorRight()
      return
    }

    if ((key.meta || key.super) && (key.backspace || key.delete)) {
      state.deleteToStart()
      return
    }

    if (key.backspace || key.delete) {
      state.delete()
      return
    }

    if (input) {
      state.insert(input)
    }
  }, { isActive: !isDisabled })

  return state.value.length > 0 ? renderedValue : renderedPlaceholder
}
