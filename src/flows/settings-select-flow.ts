import type { Settings } from '../core/schema.js'
import { cycleSortMode, moveListCursor, remapCursorByKey } from './sortable-list-flow.js'

export type SettingsSelectSortMode = 'recent' | 'name' | 'updated'

export type SettingsSelectItem = {
  name: string
  settings: Settings
  sourcePath: string
  temporary?: boolean
  updatedAt?: string
  isLastUsed?: boolean
}

export type SettingsSelectFlowState = {
  rawItems: SettingsSelectItem[]
  items: SettingsSelectItem[]
  cursor: number
  sortMode: SettingsSelectSortMode
}

export type SettingsSelectFlowEvent =
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'toggle-sort-mode' }

const SETTINGS_SELECT_SORT_MODES: readonly SettingsSelectSortMode[] = ['recent', 'name', 'updated']

export function formatSettingsSortMode(sortMode: SettingsSelectSortMode): string {
  if (sortMode === 'recent') return 'Sorted by recent'
  if (sortMode === 'updated') return 'Sorted by updated'
  return 'Sorted by name'
}

function sortSettingsItems(
  items: SettingsSelectItem[],
  sortMode: SettingsSelectSortMode,
): SettingsSelectItem[] {
  const temporary = items.filter(item => item.temporary)
  const regular = items.filter(item => !item.temporary)

  const sortedRegular = [...regular].sort((a, b) => {
    if (sortMode === 'recent') {
      if (Boolean(a.isLastUsed) !== Boolean(b.isLastUsed)) return a.isLastUsed ? -1 : 1
      return a.name.localeCompare(b.name)
    }

    if (sortMode === 'updated') {
      const updatedOrder = (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      if (updatedOrder !== 0) return updatedOrder
      return a.name.localeCompare(b.name)
    }

    return a.name.localeCompare(b.name)
  })

  return [...temporary, ...sortedRegular]
}

export function createSettingsSelectFlowState(input: {
  items: SettingsSelectItem[]
  initialName?: string
}): SettingsSelectFlowState {
  const sortMode: SettingsSelectSortMode = 'recent'
  const items = sortSettingsItems(input.items, sortMode)
  const cursor = input.initialName
    ? items.findIndex(item => item.name === input.initialName)
    : 0

  return {
    rawItems: input.items,
    items,
    cursor: cursor >= 0 ? cursor : 0,
    sortMode,
  }
}

export function reduceSettingsSelectFlow(
  state: SettingsSelectFlowState,
  event: SettingsSelectFlowEvent,
): SettingsSelectFlowState {
  if (event.type === 'up') {
    return { ...state, cursor: moveListCursor(state.cursor, state.items.length, -1) }
  }

  if (event.type === 'down') {
    return { ...state, cursor: moveListCursor(state.cursor, state.items.length, 1) }
  }

  if (event.type === 'toggle-sort-mode') {
    const sortMode = cycleSortMode(SETTINGS_SELECT_SORT_MODES, state.sortMode)
    const items = sortSettingsItems(state.rawItems, sortMode)

    return {
      ...state,
      items,
      sortMode,
      cursor: remapCursorByKey(state.items, items, state.cursor, item => item.name),
    }
  }

  return state
}

export function renameSettingsSelectItem(
  state: SettingsSelectFlowState,
  previousName: string,
  nextName: string,
): SettingsSelectFlowState {
  const renameItem = (item: SettingsSelectItem) => (
    item.name === previousName ? { ...item, name: nextName } : item
  )

  return {
    ...state,
    rawItems: state.rawItems.map(renameItem),
    items: state.items.map(renameItem),
  }
}
