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
  return { sources, cursor: 0, mode: 'select-source', manualPath: '', name: '' }
}
