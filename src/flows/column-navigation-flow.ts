import { clampIndex } from './sortable-list-flow.js'

export function moveColumnFocus<T extends string>(
  focuses: readonly T[],
  focus: T,
  direction: -1 | 1,
): T {
  const index = focuses.indexOf(focus)
  if (index < 0) return focus
  return focuses[clampIndex(index + direction, focuses.length)] ?? focus
}

export function escapeColumnFocus<T extends string>(
  focus: T,
  primaryFocus: T,
): { focus: T; bubbled: boolean } {
  if (focus === primaryFocus) {
    return { focus, bubbled: true }
  }

  return { focus: primaryFocus, bubbled: false }
}
