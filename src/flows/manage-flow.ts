import type { PresetMeta } from '../core/schema.js'

export type ManageMode = 'browsing' | 'renaming' | 'confirm-delete'

export type ManageFlowState = {
  presets: PresetMeta[]
  cursor: number
  mode: ManageMode
}

export type ManageFlowEvent =
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'rename' }
  | { type: 'delete' }
  | { type: 'escape' }

export function createManageFlowState(presets: PresetMeta[]): ManageFlowState {
  return { presets, cursor: 0, mode: 'browsing' }
}

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(value, Math.max(0, length - 1)))
}

export function reduceManageFlow(state: ManageFlowState, event: ManageFlowEvent): ManageFlowState {
  if (event.type === 'escape') return { ...state, mode: 'browsing' }
  if (event.type === 'rename') return { ...state, mode: 'renaming' }
  if (event.type === 'delete') return { ...state, mode: 'confirm-delete' }
  if (event.type === 'up') return { ...state, cursor: clamp(state.cursor - 1, state.presets.length) }
  if (event.type === 'down') return { ...state, cursor: clamp(state.cursor + 1, state.presets.length) }
  return state
}
