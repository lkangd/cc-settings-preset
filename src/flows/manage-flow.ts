export type ManageMode = 'browsing' | 'confirm-save' | 'renaming' | 'confirm-delete'

export type ManageFlowEvent =
  | { type: 'rename' }
  | { type: 'delete' }
  | { type: 'escape' }

export function reduceManageMode(mode: ManageMode, event: ManageFlowEvent): ManageMode {
  if (event.type === 'rename') return 'renaming'
  if (event.type === 'delete') return 'confirm-delete'
  return 'browsing'
}
