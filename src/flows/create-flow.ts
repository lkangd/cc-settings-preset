import { derivePresetNameFromSettingsPath } from '../core/name.js'

export type CreateSource = {
  label: string
  filePath: string
}

export type CreateFlowState = {
  sources: CreateSource[]
  cursor: number
  mode: 'select-source' | 'manual-path' | 'name'
  selectedPath?: string
  manualPath: string
  name: string
}

export function createCreateFlowState(sources: CreateSource[]): CreateFlowState {
  return { sources, cursor: sources.length, mode: 'select-source', manualPath: '', name: '' }
}

export function transitionCreateFlowToName(
  state: CreateFlowState,
  selectedPath: string,
): CreateFlowState {
  return {
    ...state,
    mode: 'name',
    selectedPath,
    name: derivePresetNameFromSettingsPath(selectedPath),
  }
}
