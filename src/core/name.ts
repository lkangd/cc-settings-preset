export function formatTimestampForName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const day = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-')
  const time = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-')
  return `${day}-${time}`
}

export function normalizePresetName(input: string, fallbackDate = new Date()): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  return normalized || `preset-${formatTimestampForName(fallbackDate)}`
}

export function buildSettingsFileName(name: string): string {
  return `${normalizePresetName(name)}-settings.json`
}

export function buildDerivedFileName(parentName: string, derivedName: string): string {
  return `${normalizePresetName(parentName)}-${normalizePresetName(derivedName)}-settings.json`
}

export function parseSettingsFileName(fileName: string): { name: string } | undefined {
  if (!fileName.endsWith('-settings.json')) return undefined
  const name = fileName.slice(0, -'-settings.json'.length)
  return name ? { name } : undefined
}
