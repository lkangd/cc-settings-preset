import type { Settings } from '../core/schema.js'

export type SettingsSelectItem = {
  name: string
  settings: Settings
  sourcePath: string
  temporary?: boolean
}

export type SettingsSelectFlowState = {
  items: SettingsSelectItem[]
  cursor: number
}

export type SettingsSelectFlowEvent =
  | { type: 'up' }
  | { type: 'down' }

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(value, Math.max(0, length - 1)))
}

export function createSettingsSelectFlowState(input: {
  items: SettingsSelectItem[]
  initialName?: string
}): SettingsSelectFlowState {
  const initialIndex = input.initialName
    ? input.items.findIndex(item => item.name === input.initialName)
    : -1

  return {
    items: input.items,
    cursor: initialIndex >= 0 ? initialIndex : 0,
  }
}

export function reduceSettingsSelectFlow(
  state: SettingsSelectFlowState,
  event: SettingsSelectFlowEvent,
): SettingsSelectFlowState {
  if (event.type === 'up') return { ...state, cursor: clamp(state.cursor - 1, state.items.length) }
  if (event.type === 'down') return { ...state, cursor: clamp(state.cursor + 1, state.items.length) }
  return state
}
