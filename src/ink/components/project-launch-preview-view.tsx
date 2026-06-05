import type { LaunchPresetMeta } from '../../core/schema.js'
import {
  annotateToggleItems,
  createProjectLaunchFlowState,
  type ProjectLaunchToggleState,
} from '../../flows/project-launch-flow.js'
import type { DisableLockSource } from '../../services/disable-lock-service.js'
import { ProjectLaunchColumnsView } from './project-launch-columns-view.js'
import { useInkResizeVersion } from './resize-context.js'

export type ProjectLaunchPreviewViewProps = {
  presets: LaunchPresetMeta[]
  detected: ProjectLaunchToggleState
  statesByPreset: Record<string, ProjectLaunchToggleState>
  selectedPresetName: string
  toggles: ProjectLaunchToggleState
  disableLockSources?: DisableLockSource[]
  title?: string
  help?: string
}

export function ProjectLaunchPreviewView({
  presets,
  detected,
  statesByPreset,
  selectedPresetName,
  toggles,
  disableLockSources = [],
  title,
  help = 'dry-run preview',
}: ProjectLaunchPreviewViewProps) {
  useInkResizeVersion()

  const state = createProjectLaunchFlowState({
    presets,
    detected,
    statesByPreset,
    disableLockSources,
    lastUsedName: selectedPresetName,
  })
  const presetCursor = Math.max(
    0,
    state.presetItems.findIndex(item => item.name.toLowerCase() === selectedPresetName.toLowerCase()),
  )
  const previewState = {
    ...state,
    ...toggles,
    presetCursor,
    focus: 'presets' as const,
  }

  const detectedBaseline = previewState.statesByPreset.Detected ?? detected
  const pluginItems = annotateToggleItems(previewState, detectedBaseline, 'plugins', previewState.plugins)
  const skillItems = annotateToggleItems(previewState, detectedBaseline, 'skills', previewState.skills)
  const mcpItems = annotateToggleItems(previewState, detectedBaseline, 'mcps', previewState.mcps)

  return (
    <ProjectLaunchColumnsView
      presetItems={previewState.presetItems}
      presetCursor={previewState.presetCursor}
      focus="presets"
      plugins={previewState.plugins}
      pluginItems={pluginItems}
      pluginCursor={0}
      skills={previewState.skills}
      skillItems={skillItems}
      skillCursor={0}
      mcps={previewState.mcps}
      mcpItems={mcpItems}
      mcpCursor={0}
      title={title ?? 'Project launch preset'}
      help={help}
    />
  )
}
