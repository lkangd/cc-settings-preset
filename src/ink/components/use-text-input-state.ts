import { useCallback, useEffect, useReducer } from 'react'

type State = {
  previousValue: string
  value: string
  cursorOffset: number
}

type Action =
  | { type: 'move-cursor-left' }
  | { type: 'move-cursor-right' }
  | { type: 'move-cursor-to-start' }
  | { type: 'move-cursor-to-end' }
  | { type: 'insert'; text: string }
  | { type: 'delete' }
  | { type: 'delete-to-start' }
  | { type: 'delete-to-end' }
  | { type: 'delete-word-backward' }

export const reduceTextInputState = (state: State, action: Action): State => {
  switch (action.type) {
    case 'move-cursor-left':
      return { ...state, cursorOffset: Math.max(0, state.cursorOffset - 1) }
    case 'move-cursor-right':
      return { ...state, cursorOffset: Math.min(state.value.length, state.cursorOffset + 1) }
    case 'move-cursor-to-start':
      return { ...state, cursorOffset: 0 }
    case 'move-cursor-to-end':
      return { ...state, cursorOffset: state.value.length }
    case 'insert':
      return {
        ...state,
        previousValue: state.value,
        value:
          state.value.slice(0, state.cursorOffset) +
          action.text +
          state.value.slice(state.cursorOffset),
        cursorOffset: state.cursorOffset + action.text.length,
      }
    case 'delete': {
      const newCursorOffset = Math.max(0, state.cursorOffset - 1)
      return {
        ...state,
        previousValue: state.value,
        value: state.value.slice(0, newCursorOffset) + state.value.slice(state.cursorOffset),
        cursorOffset: newCursorOffset,
      }
    }
    case 'delete-to-start':
      if (state.cursorOffset === 0) return state
      return {
        ...state,
        previousValue: state.value,
        value: state.value.slice(state.cursorOffset),
        cursorOffset: 0,
      }
    case 'delete-to-end':
      if (state.cursorOffset === state.value.length) return state
      return {
        ...state,
        previousValue: state.value,
        value: state.value.slice(0, state.cursorOffset),
        cursorOffset: state.cursorOffset,
      }
    case 'delete-word-backward': {
      if (state.cursorOffset === 0) return state
      let index = state.cursorOffset
      while (index > 0 && state.value[index - 1] === ' ') index--
      while (index > 0 && state.value[index - 1] !== ' ') index--
      return {
        ...state,
        previousValue: state.value,
        value: state.value.slice(0, index) + state.value.slice(state.cursorOffset),
        cursorOffset: index,
      }
    }
  }
}

export type TextInputState = State & {
  moveCursorLeft: () => void
  moveCursorRight: () => void
  moveCursorToStart: () => void
  moveCursorToEnd: () => void
  insert: (text: string) => void
  delete: () => void
  deleteToStart: () => void
  deleteToEnd: () => void
  deleteWordBackward: () => void
  submit: () => void
}

type UseTextInputStateProps = {
  defaultValue?: string
  onChange?: (value: string) => void
  onSubmit?: () => void
}

export function useTextInputState({
  defaultValue = '',
  onChange,
  onSubmit,
}: UseTextInputStateProps): TextInputState {
  const [state, dispatch] = useReducer(reduceTextInputState, {
    previousValue: defaultValue,
    value: defaultValue,
    cursorOffset: defaultValue.length,
  })

  const moveCursorLeft = useCallback(() => dispatch({ type: 'move-cursor-left' }), [])
  const moveCursorRight = useCallback(() => dispatch({ type: 'move-cursor-right' }), [])
  const moveCursorToStart = useCallback(() => dispatch({ type: 'move-cursor-to-start' }), [])
  const moveCursorToEnd = useCallback(() => dispatch({ type: 'move-cursor-to-end' }), [])
  const insert = useCallback((text: string) => dispatch({ type: 'insert', text }), [])
  const deleteCharacter = useCallback(() => dispatch({ type: 'delete' }), [])
  const deleteToStart = useCallback(() => dispatch({ type: 'delete-to-start' }), [])
  const deleteToEnd = useCallback(() => dispatch({ type: 'delete-to-end' }), [])
  const deleteWordBackward = useCallback(() => dispatch({ type: 'delete-word-backward' }), [])
  const submit = useCallback(() => onSubmit?.(), [onSubmit])

  useEffect(() => {
    if (state.value !== state.previousValue) {
      onChange?.(state.value)
    }
  }, [state.previousValue, state.value, onChange])

  return {
    ...state,
    moveCursorLeft,
    moveCursorRight,
    moveCursorToStart,
    moveCursorToEnd,
    insert,
    delete: deleteCharacter,
    deleteToStart,
    deleteToEnd,
    deleteWordBackward,
    submit,
  }
}
