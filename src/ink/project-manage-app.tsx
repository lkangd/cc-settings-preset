import { useState } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import type { DisableRemovalMark } from '../flows/project-launch-flow.js'
import {
  annotateToggleItems,
  createProjectLaunchFlowState,
  focusProjectLaunchPreset,
  getActiveProjectLaunchItem,
  getActiveProjectLaunchState,
  getPendingDisableRemovals,
  reduceProjectLaunchFlow,
  type ProjectLaunchFlowState,
} from '../flows/project-launch-flow.js'
import type { DisableLockSource } from '../services/disable-lock-service.js'
import { ConfirmEnableUnlock } from './components/confirm-enable-unlock.js'
import { TextInput } from './components/text-input.js'
import { ToggleColumn } from './components/toggle-column.js'
import type { ProjectLaunchAppProps, ProjectLaunchResult } from './project-launch-app.js'
import type { ProjectLaunchToggleState } from '../flows/project-launch-flow.js'
import { buildLaunchPresetFileName, normalizePresetName } from '../core/name.js'

export type ProjectManageResult =
  | ProjectLaunchResult
  | { type: 'save'; presetName: string; toggles: ProjectLaunchToggleState; disableRemovals?: DisableRemovalMark[] }
  | { type: 'create'; toggles: ProjectLaunchToggleState; saveAs: string; disableRemovals?: DisableRemovalMark[] }
  | { type: 'rename'; presetName: string; newName: string }
  | { type: 'delete'; presetName: string }
  | { type: 'refresh' }

function enabledCount(items: Array<{ enabled: boolean }>): number {
  return items.filter(item => item.enabled).length
}

function syncProjectPresetRename(state: ProjectLaunchFlowState, fromName: string, toName: string): ProjectLaunchFlowState {
  const presetItems = state.presetItems.map(item => item.type === 'preset' && item.name === fromName ? { ...item, name: toName, preset: { ...item.preset, name: toName } } : item)
  const statesByPreset = Object.fromEntries(Object.entries(state.statesByPreset).map(([name, value]) => [name === fromName ? toName : name, value]))
  const draftsByPreset = Object.fromEntries(Object.entries(state.draftsByPreset).map(([name, value]) => [name === fromName ? toName : name, value]))
  return {
    ...state,
    presetItems,
    statesByPreset,
    draftsByPreset,
  }
}

function syncProjectPresetCreate(state: ProjectLaunchFlowState, rawName: string): ProjectLaunchFlowState {
  const name = normalizePresetName(rawName, { preserveCase: true })
  const createdState = (state.draftsByPreset.Detected ?? state.statesByPreset.Detected) as ProjectLaunchToggleState
  const draftsByPreset = Object.fromEntries(
    Object.entries(state.draftsByPreset).filter(([presetName]) => presetName !== 'Detected')
  ) as Record<string, ProjectLaunchToggleState>

  return focusProjectLaunchPreset({
    ...state,
    presetItems: [...state.presetItems, { type: 'preset', name, preset: { name, fileName: buildLaunchPresetFileName(name, { preserveCase: true }), createdAt: '', updatedAt: '' } }],
    statesByPreset: { ...state.statesByPreset, [name]: createdState },
    draftsByPreset,
  }, name)
}

type SaveMode = 'none' | 'name-new'

type Props = Omit<ProjectLaunchAppProps, 'onSubmit'> & {
  onSubmit: (result: ProjectManageResult) => void
  onSaveSubmit?: (presetName: string, toggles: ProjectLaunchToggleState) => Promise<string | null>
  onCreateSubmit?: (saveAs: string, toggles: ProjectLaunchToggleState) => Promise<string | null>
  onRenameSubmit?: (presetName: string, newName: string) => Promise<string | null>
}

export function ProjectManageApp({ presets, detected, statesByPreset, disableLockSources = [], lastUsedName, onSubmit, onSaveSubmit, onCreateSubmit, onRenameSubmit }: Props) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const fallbackColumns = 120
  const innerWidth = Math.max(90, stdout.columns ?? fallbackColumns)
  const gapWidth = 3
  const contentWidth = innerWidth - gapWidth
  const presetWidth = Math.max(22, Math.floor(contentWidth * 0.22))
  const detailWidth = Math.max(24, Math.floor((contentWidth - presetWidth) / 3))
  const mcpWidth = contentWidth - presetWidth - detailWidth - detailWidth
  const [state, setState] = useState(() => createProjectLaunchFlowState({
    presets,
    detected,
    statesByPreset,
    disableLockSources,
    ...(lastUsedName ? { lastUsedName } : {}),
  }))
  function disableRemovalsFromState() {
    const removals = getPendingDisableRemovals(state)
    return removals.length > 0 ? { disableRemovals: removals } : {}
  }
  const [mode, setMode] = useState<'browse' | 'rename' | 'delete'>('browse')
  const [saveMode, setSaveMode] = useState<SaveMode>('none')
  const [message, setMessage] = useState<{ text: string; color: 'yellow' | 'red' } | null>(null)
  const [newName, setNewName] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)

  useInput((input, key) => {
    if (mode !== 'browse' || saveMode !== 'none' || state.pendingEnableUnlock) return
    if (input === 'q') {
      exit()
      return
    }
    if (key.leftArrow || input === 'h') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-left' }))
    if (key.rightArrow) setState(current => reduceProjectLaunchFlow(current, { type: 'focus-right' }))
    if (key.upArrow || input === 'k') setState(current => reduceProjectLaunchFlow(current, { type: 'up' }))
    if (key.downArrow || input === 'j') setState(current => reduceProjectLaunchFlow(current, { type: 'down' }))
    if (input === 'p') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-plugins' }))
    if (input === 's') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-skills' }))
    if (input === 'm') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-mcps' }))
    if (key.escape) setState(current => reduceProjectLaunchFlow(current, { type: 'focus-presets' }))
    if (input === 't') setState(current => reduceProjectLaunchFlow(current, { type: 'toggle-sort-mode' }))
    if (input === ' ') {
      const item = getActiveProjectLaunchItem(state)
      setState(current => reduceProjectLaunchFlow(current, { type: 'toggle-current' }))
      if (item?.type === 'detected') {
        setMessage({ text: 'Press enter to create a new preset from Detected', color: 'yellow' })
      }
    }
    if (input === 'r') {
      const item = getActiveProjectLaunchItem(state)
      if (item?.type !== 'preset') {
        setMessage({ text: 'Detected cannot be renamed', color: 'yellow' })
        return
      }
      setRenameError(null)
      setNewName(item.name)
      setMode('rename')
      return
    }
    if (input === 'd') {
      const item = getActiveProjectLaunchItem(state)
      if (item?.type !== 'preset') {
        setMessage({ text: 'Detected cannot be deleted', color: 'yellow' })
        return
      }
      setMode('delete')
      return
    }
    if (input === 'l' && !key.ctrl && !key.meta) {
      const item = getActiveProjectLaunchItem(state)
      const toggles = getActiveProjectLaunchState(state)
      if (state.dirty) {
        if (item?.type === 'preset') {
          if (onSaveSubmit) {
            void (async () => {
              const error = await onSaveSubmit(item.name, toggles)
              if (error) {
                setMessage({ text: error, color: 'red' })
                return
              }
              onSubmit({ type: 'launch', presetName: item.name, toggles, ...disableRemovalsFromState() })
              exit()
            })()
            return
          }
          onSubmit({ type: 'launch', presetName: item.name, toggles, ...disableRemovalsFromState() })
          exit()
          return
        }
        setMessage({ text: 'Press enter to create a new preset from Detected', color: 'yellow' })
        setNewName('')
        setSaveMode('name-new')
        return
      }
      onSubmit({
        type: 'launch',
        toggles,
        ...disableRemovalsFromState(),
        ...(item?.type === 'preset' ? { presetName: item.name } : {}),
      })
      exit()
      return
    }
    if (key.return) {
      if (!state.dirty) return
      const item = getActiveProjectLaunchItem(state)
      const toggles = getActiveProjectLaunchState(state)
      if (item?.type === 'preset') {
        if (onSaveSubmit) {
          void (async () => {
            const error = await onSaveSubmit(item.name, toggles)
            if (error) {
              setMessage({ text: error, color: 'red' })
              return
            }
            setMessage({ text: 'Preset saved successfully', color: 'yellow' })
          })()
          return
        }
        onSubmit({ type: 'save', presetName: item.name, toggles, ...disableRemovalsFromState() })
        exit()
        return
      }
      setMessage({ text: 'Press enter to create a new preset from Detected', color: 'yellow' })
      setNewName('')
      setSaveMode('name-new')
    }
  })

  const activeItem = getActiveProjectLaunchItem(state)
  const detectedBaseline = state.statesByPreset.Detected ?? detected
  const pluginItems = annotateToggleItems(state, detectedBaseline, 'plugins', state.plugins)
  const skillItems = annotateToggleItems(state, detectedBaseline, 'skills', state.skills)
  const mcpItems = annotateToggleItems(state, detectedBaseline, 'mcps', state.mcps)

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

  if (saveMode === 'name-new') {
    return (
      <Box flexDirection="column">
        {message?.color === 'red' ? <Text color="red">{message.text}</Text> : null}
        <TextInput
          label="Project launch preset name"
          value={newName}
          onChange={value => {
            if (message?.color === 'red') setMessage(null)
            setNewName(value)
          }}
          onCancel={() => {
            setSaveMode('none')
          }}
          onSubmit={async () => {
            const saveAs = newName.trim()
            if (!saveAs) return
            if (onCreateSubmit) {
              const error = await onCreateSubmit(saveAs, getActiveProjectLaunchState(state))
              if (error) {
                setMessage({ text: error, color: 'red' })
                return
              }
              setState(current => syncProjectPresetCreate(current, saveAs))
              setMessage({ text: 'Preset created successfully', color: 'yellow' })
              setSaveMode('none')
              setNewName('')
              return
            }
            onSubmit({
              type: 'create',
              toggles: getActiveProjectLaunchState(state),
              saveAs,
              ...disableRemovalsFromState(),
            })
            exit()
          }}
        />
      </Box>
    )
  }

  if (mode === 'rename') {
    return (
      <Box flexDirection="column">
        {renameError ? <Text color="red">{renameError}</Text> : <Text> </Text>}
        <TextInput
          label={`Rename ${activeItem?.name ?? 'preset'} to`}
          value={newName}
          onChange={value => {
            setRenameError(null)
            setNewName(value)
          }}
          onCancel={() => setMode('browse')}
          onSubmit={async () => {
            if (activeItem?.type !== 'preset') return
            if (onRenameSubmit) {
              const error = await onRenameSubmit(activeItem.name, newName)
              if (error) {
                setRenameError(error)
                return
              }
              setState(current => syncProjectPresetRename(current, activeItem.name, newName.trim() || activeItem.name))
              setMessage({ text: 'Preset renamed successfully', color: 'yellow' })
              setMode('browse')
              return
            }
            onSubmit({ type: 'rename', presetName: activeItem.name, newName })
            exit()
          }}
        />
      </Box>
    )
  }

  if (mode === 'delete') {
    return (
      <Box flexDirection="column">
        <Text color="red">Delete preset {activeItem?.name ?? 'preset'}?</Text>
        <Text dimColor>press y to confirm · esc cancel</Text>
        <ConfirmDelete
          onCancel={() => setMode('browse')}
          onConfirm={() => {
            if (activeItem?.type !== 'preset') return
            onSubmit({ type: 'delete', presetName: activeItem.name })
            exit()
          }}
        />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Manage project launch presets</Text>
      <Text dimColor>←/→ switch column · p plugins · s skills · m mcps · t sort · space toggle · enter save · r rename · d delete · l launch · esc presets · q quit</Text>
      <Box marginTop={1} width={innerWidth}>
        <Box flexDirection="column" width={presetWidth} borderStyle="round" borderColor={state.focus === 'presets' ? 'cyan' : 'gray'} paddingX={0.5} paddingY={0.5}>
          <Text bold>Presets({state.presetItems.length})</Text>
          {state.presetItems.map((item, index) => (
            <Text key={item.name} wrap="truncate-end" {...(index === state.presetCursor ? { color: 'cyan' as const } : {})}>
              {state.focus === 'presets' && index === state.presetCursor ? '❯ ' : '  '}{item.name}
            </Text>
          ))}
        </Box>
        <Box width={1} />
        <ToggleColumn title={`Plugins(${enabledCount(state.plugins)}/${state.plugins.length})`} focused={state.focus === 'plugins'} items={pluginItems} cursor={state.pluginCursor} width={detailWidth} />
        <Box width={1} />
        <ToggleColumn title={`Skills(${enabledCount(state.skills)}/${state.skills.length})`} focused={state.focus === 'skills'} items={skillItems} cursor={state.skillCursor} width={detailWidth} />
        <Box width={1} />
        <ToggleColumn title={`MCPs(${enabledCount(state.mcps)}/${state.mcps.length})`} focused={state.focus === 'mcps'} items={mcpItems} cursor={state.mcpCursor} width={mcpWidth} />
      </Box>
      {state.toggleMessage ? <Text color="yellow">{state.toggleMessage}</Text> : message ? <Text color={message.color}>{message.text}</Text> : null}
    </Box>
  )
}

function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useInput((input, key) => {
    if (input === 'y') onConfirm()
    if (input === 'n' || key.escape) onCancel()
  })
  return null
}
