import { basename } from 'node:path'

function formatTimestampForName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const day = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-')
  const time = [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join('-')
  return `${day}-${time}`
}

export function derivePresetNameFromSettingsPath(filePath: string): string {
  const fileName = basename(filePath)
  const fromSettingsSuffix = fileName.replace(/-?settings\.json$/, '')
  if (fromSettingsSuffix && fromSettingsSuffix !== fileName) return fromSettingsSuffix
  if (fileName.endsWith('.json')) return fileName.slice(0, -'.json'.length)
  return fileName
}

type NormalizePresetNameOptions = {
  fallbackDate?: Date
  preserveCase?: boolean
}

export function normalizePresetName(input: string, options: NormalizePresetNameOptions = {}): string {
  const { fallbackDate = new Date(), preserveCase = false } = options
  let normalized = input.trim()
  if (!preserveCase) {
    normalized = normalized.toLowerCase()
  }

  const invalidChars = preserveCase ? /[^a-zA-Z0-9.]+/g : /[^a-z0-9.]+/g
  normalized = normalized
    .replace(invalidChars, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  return normalized || formatTimestampForName(fallbackDate)
}

export function resolvePresetIndexKey(
  presets: Record<string, unknown>,
  nameInput: string,
): string | undefined {
  const lowercaseKey = normalizePresetName(nameInput)
  if (presets[lowercaseKey]) return lowercaseKey

  const preserveCaseKey = normalizePresetName(nameInput, { preserveCase: true })
  if (presets[preserveCaseKey]) return preserveCaseKey

  const target = preserveCaseKey.toLowerCase()
  return Object.keys(presets).find(key => key.toLowerCase() === target)
}

export function buildSettingsFileName(name: string, options?: Pick<NormalizePresetNameOptions, 'preserveCase'>): string {
  return `${normalizePresetName(name, options)}-settings.json`
}

export function buildDerivedFileName(parentName: string, derivedName: string): string {
  return `${normalizePresetName(parentName)}-${normalizePresetName(derivedName)}-settings.json`
}

export function buildLaunchPresetFileName(name: string, options?: Pick<NormalizePresetNameOptions, 'preserveCase'>): string {
  return `${normalizePresetName(name, options)}-launch.json`
}

export function buildTempSettingsFileName(date = new Date()): string {
  return `${formatTimestampForName(date)}-settings.json`
}

export function buildTempSettingsStem(date = new Date()): string {
  return formatTimestampForName(date)
}

export function parseTempSettingsStem(fileName: string): string | undefined {
  if (!fileName.endsWith('-settings.json')) return undefined
  const stem = fileName.slice(0, -'-settings.json'.length)
  return stem || undefined
}

export function parseSettingsFileName(fileName: string): { name: string } | undefined {
  if (!fileName.endsWith('-settings.json')) return undefined
  const name = fileName.slice(0, -'-settings.json'.length)
  return name ? { name } : undefined
}
