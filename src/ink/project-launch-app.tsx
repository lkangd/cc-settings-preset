import { useState } from 'react'
import { Box, useApp, useInput } from 'ink'
import { TruncateText } from './components/truncate-text.js'
import type { LaunchPresetMeta } from '../core/schema.js'
import type { DisableRemovalMark } from '../flows/project-launch-flow.js'
import {
  annotateToggleItems,
  createProjectLaunchFlowState,
  formatProjectLaunchSortMode,
  getActiveProjectLaunchItem,
  getActiveProjectLaunchState,
  getPendingDisableRemovals,
  reduceProjectLaunchFlow,
  shouldBubbleProjectLaunchEscape,
  type ProjectLaunchToggleState,
} from '../flows/project-launch-flow.js'
import type { DisableLockSource } from '../services/disable-lock-service.js'
import { ConfirmEnableUnlock } from './components/confirm-enable-unlock.js'
import { ProjectLaunchColumnsView } from './components/project-launch-columns-view.js'
import { useInkResizeVersion } from './components/resize-context.js'
import { TextInput } from './components/text-input.js'
import { normalizePresetName } from '../core/name.js'

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
  const [state, setState] = useState(() =>
    createProjectLaunchFlowState({
      presets,
      detected,
      statesByPreset,
      disableLockSources,
      ...(lastUsedName ? { lastUsedName } : {}),
    })
  )
  const [saveChoice, setSaveChoice] = useState<SaveChoice>('none')
  const [newName, setNewName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [sortMessage, setSortMessage] = useState<string | null>(null)

  function disableRemovalsFromState() {
    const removals = getPendingDisableRemovals(state)
    return removals.length > 0 ? { disableRemovals: removals } : {}
  }

  function submitLaunch(saveAs?: string) {
    const normalizedSaveAs = saveAs?.trim()
    if (saveAs !== undefined && !normalizedSaveAs) return

    const item = getActiveProjectLaunchItem(state)
    const toggles = getActiveProjectLaunchState(state)
    onSubmit({
      type: 'launch',
      toggles,
      ...disableRemovalsFromState(),
      ...(item?.type === 'preset' ? { presetName: item.name } : {}),
      ...(normalizedSaveAs ? { saveAs: normalizedSaveAs } : {}),
    })
    exit()
  }

  useInput((input, key) => {
    if (saveChoice !== 'none' || state.pendingEnableUnlock) return
    if (input !== 't' && sortMessage) setSortMessage(null)
    if (input === 'q') {
      exit()
      return
    }
    if (key.leftArrow || input === 'h') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-left' }))
    if (key.rightArrow || (input === 'l' && !key.ctrl && !key.meta)) setState(current => reduceProjectLaunchFlow(current, { type: 'focus-right' }))
    if (key.upArrow || input === 'k') setState(current => reduceProjectLaunchFlow(current, { type: 'up' }))
    if (key.downArrow || input === 'j') setState(current => reduceProjectLaunchFlow(current, { type: 'down' }))
    if (key.escape) {
      if (shouldBubbleProjectLaunchEscape(state)) {
        onSubmit({ type: 'back' })
        exit()
        return
      }
      setState(current => reduceProjectLaunchFlow(current, { type: 'escape' }))
    }
    if (input === 't') {
      const nextState = reduceProjectLaunchFlow(state, { type: 'toggle-sort-mode' })
      setState(nextState)
      setSortMessage(formatProjectLaunchSortMode(nextState.sortMode))
    }
    if (input === ' ') setState(current => reduceProjectLaunchFlow(current, { type: 'toggle-current' }))
    if (key.return) {
      if (state.dirty) {
        const item = getActiveProjectLaunchItem(state)
        if (item?.type === 'preset') {
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
          onConfirm={() => setState(current => reduceProjectLaunchFlow(current, { type: 'confirm-enable-unlock' }))}
          onCancel={() => setState(current => reduceProjectLaunchFlow(current, { type: 'cancel-enable-unlock' }))}
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
              toggles: getActiveProjectLaunchState(state),
              ...disableRemovalsFromState(),
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
              const error = await onCreateSubmit(saveAs, getActiveProjectLaunchState(state))
              if (error) {
                setCreateError(error)
                return
              }
              onSubmit({
                type: 'launch',
                presetName: normalizePresetName(saveAs, { preserveCase: true }),
                toggles: getActiveProjectLaunchState(state),
                ...disableRemovalsFromState(),
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

  const detectedBaseline = state.statesByPreset.Detected ?? detected
  const pluginItems = annotateToggleItems(state, detectedBaseline, 'plugins', state.plugins)
  const skillItems = annotateToggleItems(state, detectedBaseline, 'skills', state.skills)
  const mcpItems = annotateToggleItems(state, detectedBaseline, 'mcps', state.mcps)

  const message = state.toggleMessage ?? sortMessage

  return (
    <ProjectLaunchColumnsView
      presetItems={state.presetItems}
      presetCursor={state.presetCursor}
      focus={state.focus}
      plugins={state.plugins}
      pluginItems={pluginItems}
      pluginCursor={state.pluginCursor}
      skills={state.skills}
      skillItems={skillItems}
      skillCursor={state.skillCursor}
      mcps={state.mcps}
      mcpItems={mcpItems}
      mcpCursor={state.mcpCursor}
      {...(message ? { toggleMessage: message } : {})}
    />
  )
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
