export function enabledToggleCount(items: Array<{ enabled: boolean }>): number {
  return items.filter(item => item.enabled).length
}
