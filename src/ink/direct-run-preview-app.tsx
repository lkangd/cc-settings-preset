import { Box } from 'ink'
import type { SettingsDisplayFormat } from '../core/schema.js'
import type { SettingsSelectItem } from '../flows/settings-select-flow.js'
import type { LaunchPresetMeta } from '../core/schema.js'
import type { ProjectLaunchToggleState } from '../flows/project-launch-flow.js'
import type { DisableLockSource } from '../services/disable-lock-service.js'
import { TwoColumnSettingsView } from './components/two-column-settings-view.js'
import { ProjectLaunchPreviewView } from './components/project-launch-preview-view.js'

export type DirectRunPreviewAppProps = {
  global?: {
    items: SettingsSelectItem[]
    cursor: number
    envOnly: boolean
    displayFormat: SettingsDisplayFormat
  }
  project?: {
    presets: LaunchPresetMeta[]
    detected: ProjectLaunchToggleState
    statesByPreset: Record<string, ProjectLaunchToggleState>
    selectedPresetName: string
    toggles: ProjectLaunchToggleState
    disableLockSources?: DisableLockSource[]
  }
}

export function DirectRunPreviewApp({ global, project }: DirectRunPreviewAppProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      {global ? (
        <TwoColumnSettingsView
          title="Global settings preset"
          help="dry-run preview"
          items={global.items}
          cursor={global.cursor}
          envOnly={global.envOnly}
          displayFormat={global.displayFormat}
        />
      ) : null}
      {global && project ? <Box marginTop={1} /> : null}
      {project ? (
        <ProjectLaunchPreviewView
          presets={project.presets}
          detected={project.detected}
          statesByPreset={project.statesByPreset}
          selectedPresetName={project.selectedPresetName}
          toggles={project.toggles}
          {...(project.disableLockSources ? { disableLockSources: project.disableLockSources } : {})}
        />
      ) : null}
    </Box>
  )
}
