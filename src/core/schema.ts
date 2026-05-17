import { z } from 'zod'

export const skillOverrideValueSchema = z.enum(['on', 'name-only', 'user-invocable-only', 'off'])

export const settingsSchema = z.looseObject({
  enabledPlugins: z.record(z.string(), z.boolean()).optional(),
  skillOverrides: z.record(z.string(), skillOverrideValueSchema).optional(),
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

export const presetMetaSchema = z.discriminatedUnion('type', [basePresetMetaSchema, derivedPresetMetaSchema])

export const indexSchema = z.object({
  version: z.literal(1),
  presets: z.record(z.string(), presetMetaSchema),
})

export type Settings = z.infer<typeof settingsSchema>
export type SkillOverrideValue = z.infer<typeof skillOverrideValueSchema>
export type PresetMeta = z.infer<typeof presetMetaSchema>
export type BasePresetMeta = z.infer<typeof basePresetMetaSchema>
export type DerivedPresetMeta = z.infer<typeof derivedPresetMetaSchema>
export type PresetIndex = z.infer<typeof indexSchema>

export function parseSettings(value: unknown): Settings {
  return settingsSchema.parse(value)
}

export function createEmptyIndex(): PresetIndex {
  return { version: 1, presets: {} }
}
