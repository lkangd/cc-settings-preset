export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {}
}
