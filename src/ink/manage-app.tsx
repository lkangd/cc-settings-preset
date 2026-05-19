import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'

import type { PresetMeta } from '../core/schema.js'
import { reduceManageMode, type ManageMode } from '../flows/manage-flow.js'
import { createRunFlowState, reduceRunFlow, type RunFlowState } from '../flows/run-flow.js'
import { sortPluginStates, type PluginState } from '../services/plugin-service.js'
import { sortSkillStatesByStatus, type SkillState } from '../services/skill-service.js'
import { TextInput } from './components/text-input.js'
import { ThreeColumnView } from './components/three-column-view.js'

export type ManageResult =
  | { type: 'save'; preset: PresetMeta; plugins: PluginState[]; skills: SkillState[] }
  | { type: 'launch'; preset: PresetMeta }
  | { type: 'delete'; preset: PresetMeta }
  | { type: 'refresh' }
  | { type: 'exit' }

type DebugAction = {
  input: string
  key?: {
    return?: boolean
    escape?: boolean
    upArrow?: boolean
    downArrow?: boolean
    leftArrow?: boolean
    rightArrow?: boolean
  }
}

export type ManageInitialState = {
  renamePresetName?: string
  renameValue?: string
  renameError?: string
}

type PendingActionAfterSave = 'rename' | null

type Props = {
  presets: PresetMeta[]
  pluginsByPreset: Record<string, PluginState[]>
  skillsByPreset: Record<string, SkillState[]>
  onSubmit: (result: ManageResult) => void
  onRenameSubmit?: (preset: PresetMeta, newName: string) => Promise<string | null>
  initialDebugActions?: DebugAction[]
  initialState?: ManageInitialState
}

function activePreset(state: RunFlowState): PresetMeta | undefined {
  return state.presets[state.settingsCursor]
}

function hasDraftForActivePreset(state: RunFlowState): boolean {
  const preset = activePreset(state)
  return Boolean(preset && state.draftsByPreset[preset.name])
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

function sortPluginsForManageMode(plugins: PluginState[], sortMode: RunFlowState['sortMode']): PluginState[] {
  return sortMode === 'status' ? sortPluginStates(plugins) : sortByName(plugins)
}

function sortSkillsForManageMode(skills: SkillState[], sortMode: RunFlowState['sortMode']): SkillState[] {
  return sortMode === 'status' ? sortSkillStatesByStatus(skills) : sortByName(skills)
}

function commitActiveDraft(state: RunFlowState): RunFlowState {
  const preset = activePreset(state)
  const draft = preset ? state.draftsByPreset[preset.name] : undefined
  if (!preset || !draft) return state

  const { [preset.name]: _removed, ...draftsByPreset } = state.draftsByPreset
  const sortedPlugins = sortPluginsForManageMode(draft.plugins, state.sortMode)
  const sortedSkills = sortSkillsForManageMode(draft.skills, state.sortMode)

  return {
    ...state,
    pluginsByPreset: {
      ...state.pluginsByPreset,
      [preset.name]: sortedPlugins,
    },
    skillsByPreset: {
      ...state.skillsByPreset,
      [preset.name]: sortedSkills,
    },
    draftsByPreset,
    dirty: Object.keys(draftsByPreset).length > 0,
    plugins: sortedPlugins,
    skills: sortedSkills,
  }
}

function getAffectedPresetNames(state: RunFlowState): string[] {
  const preset = activePreset(state)
  if (!preset) return []
  return [preset.name]
}

function requiresSaveConfirmation(state: RunFlowState): boolean {
  const preset = activePreset(state)
  return Boolean(preset && preset.type === 'derived' && hasDraftForActivePreset(state))
}

function resolveInitialCursor(state: RunFlowState, initialState?: ManageInitialState): RunFlowState {
  const targetName = initialState?.renamePresetName
  if (!targetName) return state
  const settingsCursor = state.presets.findIndex(preset => preset.name === targetName)
  if (settingsCursor === -1) return state
  return {
    ...state,
    settingsCursor,
    plugins: sortPluginsForManageMode(state.pluginsByPreset[targetName] ?? [], state.sortMode),
    skills: sortSkillsForManageMode(state.skillsByPreset[targetName] ?? [], state.sortMode),
  }
}

function replayDebugActions(state: RunFlowState, actions: DebugAction[]): {
  state: RunFlowState
  mode: ManageMode
  message: string | null
  submissions: ManageResult[]
  pendingActionAfterSave: PendingActionAfterSave
} {
  let currentState = state
  let mode: ManageMode = 'browsing'
  let message: string | null = null
  let pendingActionAfterSave: PendingActionAfterSave = null
  const submissions: ManageResult[] = []

  for (const action of actions) {
    const preset = activePreset(currentState)
    const hasDraft = hasDraftForActivePreset(currentState)

    if (mode === 'confirm-save') {
      if (action.key?.escape) {
        mode = 'browsing'
        pendingActionAfterSave = null
        continue
      }

      if (action.key?.return && preset && hasDraft) {
        submissions.push({ type: 'save', preset, plugins: currentState.plugins, skills: currentState.skills })
        currentState = commitActiveDraft(currentState)
        mode = pendingActionAfterSave === 'rename' ? 'renaming' : 'browsing'
        pendingActionAfterSave = null
        continue
      }

      continue
    }

    if (mode === 'renaming' || mode === 'confirm-delete') break

    if (action.key?.escape) {
      message = null
      currentState = reduceRunFlow(currentState, { type: 'escape' })
      continue
    }

    if (action.input === 'p') {
      message = null
      currentState = reduceRunFlow(currentState, { type: 'focus-plugins' })
      continue
    }

    if (action.input === 's') {
      message = null
      currentState = reduceRunFlow(currentState, { type: 'focus-skills' })
      continue
    }

    if (action.key?.leftArrow || action.input === 'h') {
      message = null
      currentState = reduceRunFlow(currentState, { type: 'focus-left' })
      continue
    }

    if (action.key?.rightArrow) {
      message = null
      currentState = reduceRunFlow(currentState, { type: 'focus-right' })
      continue
    }

    if (action.input === 'l') {
      if (currentState.focus !== 'settings') {
        message = null
        currentState = reduceRunFlow(currentState, { type: 'focus-right' })
        continue
      }

      if (!preset) continue
      if (hasDraft) {
        submissions.push({ type: 'save', preset, plugins: currentState.plugins, skills: currentState.skills })
      }
      submissions.push({ type: 'launch', preset })
      continue
    }

    if (action.key?.upArrow || action.input === 'k') {
      message = null
      currentState = reduceRunFlow(currentState, { type: 'up' })
      continue
    }

    if (action.key?.downArrow || action.input === 'j') {
      message = null
      currentState = reduceRunFlow(currentState, { type: 'down' })
      continue
    }

    if (action.input === 't') {
      message = null
      currentState = reduceRunFlow(currentState, { type: 'toggle-sort-mode' })
      continue
    }

    if (action.input === ' ') {
      message = null
      currentState = reduceRunFlow(currentState, { type: 'toggle-current' })
      continue
    }

    if (action.key?.return) {
      if (!preset) continue
      if (!hasDraft) {
        message = 'no changes to save'
        continue
      }
      if (requiresSaveConfirmation(currentState)) {
        mode = 'confirm-save'
        continue
      }

      submissions.push({ type: 'save', preset, plugins: currentState.plugins, skills: currentState.skills })
      currentState = commitActiveDraft(currentState)
      message = null
      continue
    }

    if (action.input === 'r') {
      if (hasDraft) {
        pendingActionAfterSave = 'rename'
        if (requiresSaveConfirmation(currentState)) {
          mode = 'confirm-save'
          continue
        }
        submissions.push({ type: 'save', preset: preset!, plugins: currentState.plugins, skills: currentState.skills })
        currentState = commitActiveDraft(currentState)
      }

      message = null
      mode = 'renaming'
      pendingActionAfterSave = null
      continue
    }

    if (action.input === 'd') {
      message = null
      mode = 'confirm-delete'
    }
  }

  return { state: currentState, mode, message, submissions, pendingActionAfterSave }
}

export function ManageApp({ presets, pluginsByPreset, skillsByPreset, onSubmit, onRenameSubmit, initialDebugActions, initialState }: Props) {
  const { exit } = useApp()
  const initialFlowState = resolveInitialCursor(createRunFlowState({ presets, pluginsByPreset, skillsByPreset }), initialState)
  const debugSession = initialDebugActions ? replayDebugActions(initialFlowState, initialDebugActions) : null
  const [state, setState] = useState(() => debugSession?.state ?? initialFlowState)
  const [mode, setMode] = useState<ManageMode>(() => {
    if (initialState?.renamePresetName) return 'renaming'
    return debugSession?.mode ?? 'browsing'
  })
  const [message, setMessage] = useState<string | null>(debugSession?.message ?? null)
  const [renameError, setRenameError] = useState<string | null>(initialState?.renameError ?? null)
  const [newName, setNewName] = useState(initialState?.renameValue ?? '')
  const [pendingActionAfterSave, setPendingActionAfterSave] = useState<PendingActionAfterSave>(debugSession?.pendingActionAfterSave ?? null)
  const active = activePreset(state)
  const affectedPresetNames = getAffectedPresetNames(state)

  for (const submission of debugSession?.submissions ?? []) {
    onSubmit(submission)
  }

  function emitSave(current: RunFlowState) {
    const preset = activePreset(current)
    if (!preset) return

    onSubmit({
      type: 'save',
      preset,
      plugins: current.plugins,
      skills: current.skills,
    })
  }

  function confirmSave() {
    if (!active || !hasDraftForActivePreset(state)) return
    emitSave(state)
    setState(current => commitActiveDraft(current))
    setMessage(null)

    if (pendingActionAfterSave === 'rename') {
      setPendingActionAfterSave(null)
      setMode('renaming')
      return
    }

    setMode('browsing')
  }

  function handleBrowsingInput(input: string, key: DebugAction['key'] = {}) {
    if (key.escape) {
      setMessage(null)
      setState(current => reduceRunFlow(current, { type: 'escape' }))
      return
    }

    if (input === 'q') {
      onSubmit({ type: 'exit' })
      exit()
      return
    }

    if (input === 'p') {
      setMessage(null)
      setState(current => reduceRunFlow(current, { type: 'focus-plugins' }))
      return
    }

    if (input === 's') {
      setMessage(null)
      setState(current => reduceRunFlow(current, { type: 'focus-skills' }))
      return
    }

    if (key.leftArrow || input === 'h') {
      setMessage(null)
      setState(current => reduceRunFlow(current, { type: 'focus-left' }))
      return
    }

    if (key.rightArrow) {
      setMessage(null)
      setState(current => reduceRunFlow(current, { type: 'focus-right' }))
      return
    }

    if (input === 'l') {
      if (state.focus !== 'settings') {
        setMessage(null)
        setState(current => reduceRunFlow(current, { type: 'focus-right' }))
        return
      }

      if (!active) return
      if (hasDraftForActivePreset(state)) emitSave(state)
      onSubmit({ type: 'launch', preset: active })
      exit()
      return
    }

    if (key.upArrow || input === 'k') {
      setMessage(null)
      setState(current => reduceRunFlow(current, { type: 'up' }))
      return
    }

    if (key.downArrow || input === 'j') {
      setMessage(null)
      setState(current => reduceRunFlow(current, { type: 'down' }))
      return
    }

    if (input === 't') {
      setMessage(null)
      setState(current => reduceRunFlow(current, { type: 'toggle-sort-mode' }))
      return
    }

    if (input === ' ') {
      setMessage(null)
      setState(current => reduceRunFlow(current, { type: 'toggle-current' }))
      return
    }

    if (key.return) {
      if (!active) return
      if (!hasDraftForActivePreset(state)) {
        setMessage('no changes to save')
        return
      }
      if (requiresSaveConfirmation(state)) {
        setPendingActionAfterSave(null)
        setMode('confirm-save')
        return
      }

      emitSave(state)
      setState(current => commitActiveDraft(current))
      setMessage(null)
      return
    }

    if (input === 'r') {
      if (hasDraftForActivePreset(state)) {
        setPendingActionAfterSave('rename')
        if (requiresSaveConfirmation(state)) {
          setMode('confirm-save')
          return
        }
        emitSave(state)
        setState(current => commitActiveDraft(current))
      }

      setMessage(null)
      setMode('renaming')
      setPendingActionAfterSave(null)
      return
    }

    if (input === 'd') {
      setMessage(null)
      setMode('confirm-delete')
    }
  }

  useInput((input, key) => {
    if (mode === 'confirm-save') {
      if (key.escape) {
        setPendingActionAfterSave(null)
        setMode('browsing')
        return
      }
      if (key.return) confirmSave()
      return
    }

    if (mode !== 'browsing') return
    handleBrowsingInput(input, key)
  })

  if (mode === 'confirm-save') {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Save changes to affected presets?</Text>
        {affectedPresetNames.map(name => <Text key={name}>- {name}</Text>)}
        <Text dimColor>press enter to confirm · esc cancel</Text>
      </Box>
    )
  }

  if (mode === 'renaming') {
    return (
      <Box flexDirection="column">
        <Text color={renameError ? 'red' : ''}>{renameError ?? ' '}</Text>
        <TextInput
          label={`Rename ${active?.name ?? 'preset'} to`}
          value={newName}
          placeholder="new-name"
          onChange={value => {
            setRenameError(null)
            setNewName(value)
          }}
          onCancel={() => {
            setRenameError(null)
            setMode(current => reduceManageMode(current, { type: 'escape' }))
          }}
          onSubmit={async () => {
            if (!active) return
            const error = onRenameSubmit ? await onRenameSubmit(active, newName) : null
            if (error) {
              setRenameError(error)
              return
            }
            onSubmit({ type: 'refresh' })
            exit()
          }}
        />
      </Box>
    )
  }

  if (mode === 'confirm-delete') {
    return (
      <Box flexDirection="column">
        <Text color="red">Delete preset {active?.name ?? 'preset'}?</Text>
        <Text dimColor>press y to confirm · esc cancel</Text>
        <ConfirmDelete
          onCancel={() => setMode(current => reduceManageMode(current, { type: 'escape' }))}
          onConfirm={() => {
            if (!active) return
            onSubmit({ type: 'delete', preset: active })
            exit()
          }}
        />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <ThreeColumnView
        title="Manage settings presets"
        help="↑/k ↓/j navigate · ←/→ switch column · p plugins · s skills · t sort · space toggle · enter save · l launch · r rename · d delete · q quit"
        presets={state.presets}
        plugins={state.plugins}
        skills={state.skills}
        focus={state.focus}
        settingsCursor={state.settingsCursor}
        pluginCursor={state.pluginCursor}
        skillCursor={state.skillCursor}
        sortMode={state.sortMode}
      />
      {message ? <Text color="yellow">{message}</Text> : null}
    </Box>
  )
}

function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useInput((input, key) => {
    if (input === 'y') onConfirm()
    if (key.escape || input === 'n') onCancel()
  })

  return null
}
