import { useState } from 'react'
import { Box, useApp, useInput } from 'ink'
import { TruncateText } from './components/truncate-text.js'
import type { LaunchPresetMeta } from '../core/schema.js'
import type { DisableRemovalMark, ProjectLaunchToggleState } from '../flows/project-launch-flow.js'
import type { DisableLockSource } from '../services/disable-lock-service.js'
import { ConfirmEnableUnlock } from './components/confirm-enable-unlock.js'
import { ProjectLaunchColumnsView } from './components/project-launch-columns-view.js'
import { useInkResizeVersion } from './components/resize-context.js'
import { TextInput } from './components/text-input.js'
import { normalizePresetName } from '../core/name.js'
import { useProjectLaunchBrowserController } from './use-project-launch-browser-controller.js'

type SaveChoice = 'none' | 'confirm-save' | 'name-new'

export type ProjectLaunchResult =
  | { type: 'launch'; presetName?: string; toggles: ProjectLaunchToggleState; saveAs?: string; disableRemovals?: DisableRemovalMark[] }
  | { type: 'temp-launch'; toggles: ProjectLaunchToggleState; disableRemovals?: DisableRemovalMark[] }
  | { type: 'back' }

export type ProjectLaunchAppProps = {
  presets: LaunchPresetMeta[]
  detected: ProjectLaunchToggleState
  statesByPreset: Record<string, ProjectLaunchToggleState>
  disableLockSources?: DisableLockSource[]
  lastUsedName?: string
  onSubmit: (result: ProjectLaunchResult) => void
  onCreateSubmit?: (saveAs: string, toggles: ProjectLaunchToggleState) => Promise<string | null>
}

export function ProjectLaunchApp({ presets, detected, statesByPreset, disableLockSources = [], lastUsedName, onSubmit, onCreateSubmit }: ProjectLaunchAppProps) {
  useInkResizeVersion()
  const { exit } = useApp()
  const controller = useProjectLaunchBrowserController({
    presets,
    detected,
    statesByPreset,
    disableLockSources,
    ...(lastUsedName ? { lastUsedName } : {}),
  })
  const { state, activeItem, activeToggleState, columnsProps } = controller
  const [saveChoice, setSaveChoice] = useState<SaveChoice>('none')
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  function submitLaunch(saveAs?: string) {
    const normalizedSaveAs = saveAs?.trim()
    if (saveAs !== undefined && !normalizedSaveAs) return

    onSubmit({
      type: 'launch',
      toggles: activeToggleState,
      ...controller.disableRemovalsProps(),
      ...(activeItem?.type === 'preset' ? { presetName: activeItem.name } : {}),
      ...(normalizedSaveAs ? { saveAs: normalizedSaveAs } : {}),
    })
    exit()
  }

  useInput((input, key) => {
    if (saveChoice !== 'none' || state.pendingEnableUnlock) return
    if (input === 'q') {
      exit()
      return
    }
    const browserResult = controller.dispatchBrowserKey(input, key)
    if (browserResult.bubbledEscape) {
      onSubmit({ type: 'back' })
      exit()
      return
    }
    if (key.return) {
      if (state.dirty) {
        if (activeItem?.type === 'preset') {
          submitLaunch()
          return
        }
        setSaveChoice('confirm-save')
        return
      }
      submitLaunch()
    }
  })

  if (state.pendingEnableUnlock) {
    return (
      <Box flexDirection="column">
        <ConfirmEnableUnlock
          itemName={state.pendingEnableUnlock.name}
          {...(state.pendingEnableUnlock.filePath ? { filePath: state.pendingEnableUnlock.filePath } : {})}
          {...(state.pendingEnableUnlock.requiredPlugin ? { requiredPlugin: state.pendingEnableUnlock.requiredPlugin } : {})}
          onConfirm={controller.confirmEnableUnlock}
          onCancel={controller.cancelEnableUnlock}
        />
      </Box>
    )
  }

  if (saveChoice === 'confirm-save') {
    return (
      <Box flexDirection="column">
        <TruncateText color="yellow">Save changes as a new project launch preset?</TruncateText>
        <TruncateText dimColor>press Y to save · n for retained temp settings · esc cancel</TruncateText>
        <ConfirmSaveChoice
          onSave={() => setSaveChoice('name-new')}
          onTemp={() => {
            onSubmit({
              type: 'temp-launch',
              toggles: activeToggleState,
              ...controller.disableRemovalsProps(),
            })
            exit()
          }}
          onCancel={() => setSaveChoice('none')}
        />
      </Box>
    )
  }

  if (saveChoice === 'name-new') {
    return (
      <Box flexDirection="column">
        {createError ? <TruncateText color="red">{createError}</TruncateText> : null}
        <TextInput
          label="Project launch preset name"
          value={newName}
          onChange={value => {
            setCreateError(null)
            setNewName(value)
          }}
          onCancel={() => {
            setCreateError(null)
            setSaveChoice('confirm-save')
          }}
          onSubmit={async () => {
            const saveAs = newName.trim()
            if (!saveAs) return
            if (onCreateSubmit) {
              const error = await onCreateSubmit(saveAs, activeToggleState)
              if (error) {
                setCreateError(error)
                return
              }
              onSubmit({
                type: 'launch',
                presetName: normalizePresetName(saveAs, { preserveCase: true }),
                toggles: activeToggleState,
                ...controller.disableRemovalsProps(),
              })
              exit()
              return
            }
            submitLaunch(newName)
          }}
        />
      </Box>
    )
  }

  return <ProjectLaunchColumnsView {...columnsProps} />
}

function ConfirmSaveChoice({
  onSave,
  onTemp,
  onCancel
}: {
  onSave: () => void
  onTemp: () => void
  onCancel: () => void
}) {
  useInput((input, key) => {
    if (input === 'y' || key.return) onSave()
    if (input === 'n') onTemp()
    if (key.escape) onCancel()
  })
  return null
}
