import { z } from 'zod'

const skillOverrideValueSchema = z.enum(['on', 'name-only', 'user-invocable-only', 'off'])

const mcpPolicyEntrySchema = z.union([
  z.object({ serverName: z.string().min(1) }).strict(),
  z.object({ serverCommand: z.array(z.string()).min(1) }).strict(),
  z.object({ serverUrl: z.string().min(1) }).strict(),
])

export const settingsSchema = z.looseObject({
  enabledPlugins: z.record(z.string(), z.boolean()).optional(),
  skillOverrides: z.record(z.string(), skillOverrideValueSchema).optional(),
  deniedMcpServers: z.array(mcpPolicyEntrySchema).optional(),
})

const launchPresetSettingsSchema = z.object({
  enabledPlugins: z.record(z.string(), z.boolean()).optional(),
  skillOverrides: z.record(z.string(), skillOverrideValueSchema).optional(),
  deniedMcpServers: z.array(mcpPolicyEntrySchema).optional(),
})

const timestampSchema = z.string().refine(value => !Number.isNaN(Date.parse(value)), 'Expected ISO timestamp')

const basePresetMetaSchema = z.object({
  type: z.literal('base'),
  name: z.string().min(1),
  fileName: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const derivedPresetMetaSchema = z.object({
  type: z.literal('derived'),
  name: z.string().min(1),
  parentName: z.string().min(1),
  fileName: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const launchPresetMetaSchema = z.object({
  name: z.string().min(1),
  fileName: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

const lastUsedBasePresetSchema = z.object({
  presetName: z.string().min(1),
  updatedAt: timestampSchema,
})

const presetMetaSchema = z.discriminatedUnion('type', [basePresetMetaSchema, derivedPresetMetaSchema])

export const indexSchema = z.object({
  version: z.literal(1),
  presets: z.record(z.string(), presetMetaSchema),
})

export const launchPresetIndexSchema = z.object({
  version: z.literal(1),
  presets: z.record(z.string(), launchPresetMetaSchema),
})

export const lastUsedLaunchPresetSchema = z.object({
  presetName: z.string().min(1),
  updatedAt: timestampSchema,
})

export const lastSettingsSchema = z.record(z.string(), lastUsedBasePresetSchema)

export const ccspConfigSchema = z.object({
  globalPresetEnvOnly: z.boolean().default(true),
  statusLineEnabled: z.boolean().default(true),
})

const sessionToggleStateSchema = z.object({
  plugins: z.array(z.unknown()),
  skills: z.array(z.unknown()),
  mcps: z.array(z.unknown()),
})

const sessionBindingSchema = z.object({
  sessionId: z.string().min(1),
  globalName: z.string(),
  projectPresetName: z.string(),
  baseSettings: z.unknown(),
  launchSettings: launchPresetSettingsSchema,
  toggles: sessionToggleStateSchema,
  createdAt: timestampSchema,
  lastUsedAt: timestampSchema,
  exitedAt: timestampSchema.optional(),
})

export const sessionIndexSchema = z.object({
  version: z.literal(1),
  sessions: z.record(z.string(), sessionBindingSchema),
})

export type McpPolicyEntry = z.infer<typeof mcpPolicyEntrySchema>
export type Settings = z.infer<typeof settingsSchema>
export type LaunchPresetSettings = z.infer<typeof launchPresetSettingsSchema>
export type SkillOverrideValue = z.infer<typeof skillOverrideValueSchema>
export type PresetMeta = z.infer<typeof presetMetaSchema>
export type BasePresetMeta = z.infer<typeof basePresetMetaSchema>
export type DerivedPresetMeta = z.infer<typeof derivedPresetMetaSchema>
export type PresetIndex = z.infer<typeof indexSchema>
export type LaunchPresetMeta = z.infer<typeof launchPresetMetaSchema>
export type LaunchPresetIndex = z.infer<typeof launchPresetIndexSchema>
export type LastUsedLaunchPreset = z.infer<typeof lastUsedLaunchPresetSchema>
export type LastUsedBasePreset = z.infer<typeof lastUsedBasePresetSchema>
export type LastSettings = z.infer<typeof lastSettingsSchema>
export type CcspConfig = z.infer<typeof ccspConfigSchema>
export type SessionBinding = z.infer<typeof sessionBindingSchema>
export type SessionIndex = z.infer<typeof sessionIndexSchema>

export function parseSettings(value: unknown): Settings {
  return settingsSchema.parse(value)
}

export function parseLaunchPresetSettings(value: unknown): LaunchPresetSettings {
  return launchPresetSettingsSchema.parse(value)
}

export function parseCcspConfig(value: unknown): CcspConfig {
  return ccspConfigSchema.parse(value ?? {})
}

export function createEmptyIndex(): PresetIndex {
  return { version: 1, presets: {} }
}

export function createEmptyLaunchPresetIndex(): LaunchPresetIndex {
  return { version: 1, presets: {} }
}

export function createEmptySessionIndex(): SessionIndex {
  return { version: 1, sessions: {} }
}
