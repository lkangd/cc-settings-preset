import {
  resolveGlobalLaunchTemplateIndexPath,
  resolveGlobalLaunchTemplatePath,
} from '../core/paths.js'
import type { LaunchPresetMeta, LaunchPresetSettings, PresetOrigin } from '../core/schema.js'
import { createLaunchPresetStore } from './launch-preset-store.js'

export type LaunchTemplateService = ReturnType<typeof createLaunchTemplateService>

// Global, cross-project launch presets. Templates are only ever produced by
// promoting a preset that already works in some project: building one from
// scratch would mean a plugin picker with no project to detect against, i.e. a
// screen where every entry is greyed out.
export function createLaunchTemplateService(globalRoot: string) {
  const store = createLaunchPresetStore({
    indexPath: resolveGlobalLaunchTemplateIndexPath(globalRoot),
    resolveFilePath: fileName => resolveGlobalLaunchTemplatePath(globalRoot, fileName),
    label: 'Launch template',
    notFoundCode: 'launch_template_not_found',
    existsCode: 'launch_template_already_exists',
  })

  return {
    listTemplates: store.listPresets,

    listTemplatesWithSettings: store.listPresetsWithSettings,

    readTemplateSettings: store.readPresetSettings,

    async promote(
      nameInput: string,
      settings: LaunchPresetSettings,
      origin: PresetOrigin,
    ): Promise<LaunchPresetMeta> {
      return store.createPreset(nameInput, settings, { origin })
    },

    // Separate from `promote()` rather than an `overwrite` flag: overwriting is
    // only ever reached through an explicit confirmation, and collapsing the two
    // would make the destructive path the one you get by forgetting an argument.
    async overwrite(
      nameInput: string,
      settings: LaunchPresetSettings,
      origin: PresetOrigin,
    ): Promise<LaunchPresetMeta> {
      return store.writePresetSettings(nameInput, settings, { origin })
    },

    renameTemplate: store.renamePreset,

    deleteTemplate: store.deletePreset,
  }
}
