export function clampIndex(value: number, length: number): number {
  return Math.max(0, Math.min(value, Math.max(0, length - 1)))
}

export function cycleSortMode<T extends string>(
  modes: readonly T[],
  current: T,
): T {
  const index = modes.indexOf(current)
  if (index < 0) return modes[0] ?? current
  return modes[(index + 1) % modes.length] ?? current
}

export function moveListCursor(
  cursor: number,
  length: number,
  direction: -1 | 1,
): number {
  return clampIndex(cursor + direction, length)
}

export function remapCursorByKey<T>(
  previousItems: T[],
  nextItems: T[],
  previousCursor: number,
  getKey: (item: T) => string,
): number {
  const previousItem = previousItems[previousCursor]
  if (!previousItem) return clampIndex(previousCursor, nextItems.length)

  const previousKey = getKey(previousItem)
  const nextIndex = nextItems.findIndex(item => getKey(item) === previousKey)
  if (nextIndex >= 0) return nextIndex

  return clampIndex(previousCursor, nextItems.length)
}
