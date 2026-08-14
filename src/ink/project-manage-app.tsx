import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import type { DisableRemovalMark } from '../flows/project-launch-flow.js'
import {
  changedProjectLaunchPresetProps,
  focusProjectLaunchPreset,
  getChangedProjectLaunchPresets,
  type ChangedProjectLaunchPresets,
  type ProjectLaunchFlowState,
} from '../flows/project-launch-flow.js'
import type { DisableLockSource } from '../services/disable-lock-service.js'
import { ConfirmDelete } from './components/confirm-delete.js'
import { ConfirmEnableUnlock } from './components/confirm-enable-unlock.js'
import { TextInput } from './components/text-input.js'
import { ImportPanel, type ImportCandidateView, type ImportOutcome } from './components/import-panel.js'
import { PresetConflictPrompt, type PresetConflictChoice } from './components/preset-conflict-prompt.js'
import { ProjectLaunchColumnsView } from './components/project-launch-columns-view.js'
import type { ProjectLaunchAppProps, ProjectLaunchResult } from './project-launch-app.js'
import type { ProjectLaunchToggleState } from '../flows/project-launch-flow.js'
import { buildLaunchPresetFileName, normalizePresetName } from '../core/name.js'

export type ProjectManageResult =
  | ProjectLaunchResult
  | { type: 'save'; presetName: string; toggles: ProjectLaunchToggleState; disableRemovals?: DisableRemovalMark[] }
  | { type: 'create'; toggles: ProjectLaunchToggleState; saveAs: string; disableRemovals?: DisableRemovalMark[]; changedPresets?: ChangedProjectLaunchPresets; savedPresets?: string[] }
  | { type: 'rename'; presetName: string; newName: string }
  | { type: 'delete'; presetName: string }
  | { type: 'refresh' }

import { useProjectLaunchBrowserController } from './use-project-launch-browser-controller.js'

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
  // A callback rather than a list: the candidates are whatever is on disk when
  // the panel opens, and this screen can change that itself — promoting a
  // preset with `s`, or renaming and deleting templates inside the panel. A
  // snapshot taken before mounting goes stale the first time it does.
  loadImportCandidates?: () => Promise<ImportCandidateView[]>
  onPromoteSubmit?: (presetName: string, templateName: string, overwrite: boolean) => Promise<ImportOutcome>
  onImportSubmit?: (candidateId: string, targetName: string, overwrite: boolean) => Promise<ImportOutcome>
  onTemplateRenameSubmit?: (candidateId: string, newName: string) => Promise<ImportOutcome>
  onTemplateDeleteSubmit?: (candidateId: string) => Promise<ImportOutcome>
}

export function ProjectManageApp({
  presets,
  detected,
  statesByPreset,
  disableLockSources = [],
  lastUsedName,
  onSubmit,
  onSaveSubmit,
  onCreateSubmit,
  onRenameSubmit,
  loadImportCandidates,
  onPromoteSubmit,
  onImportSubmit,
  onTemplateRenameSubmit,
  onTemplateDeleteSubmit,
}: Props) {
  const { exit } = useApp()
  const controller = useProjectLaunchBrowserController({
    presets,
    detected,
    statesByPreset,
    disableLockSources,
    ...(lastUsedName ? { lastUsedName } : {}),
    moveRightWithL: false,
    title: 'Manage project launch presets',
    help: '←/→ switch column · h/j/k navigate · t sort · space toggle · enter save · r rename · d delete · s template · i import · l launch · esc presets/quit · q quit',
  })
  const { state, activeItem, activeToggleState, columnsProps } = controller
  const [mode, setMode] = useState<'browse' | 'rename' | 'delete' | 'import' | 'promote' | 'promote-conflict'>('browse')
  const [saveMode, setSaveMode] = useState<SaveMode>('none')
  const [message, setMessage] = useState<{ text: string; color: 'yellow' | 'red' } | null>(null)
  const [newName, setNewName] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [promoteName, setPromoteName] = useState('')
  const [promoteError, setPromoteError] = useState<string | null>(null)
  // `null` while a scan is in flight. The scan is a handful of small JSON reads
  // and normally lands within a frame, but the panel must not mount against a
  // list it does not have yet.
  const [importCandidates, setImportCandidates] = useState<ImportCandidateView[] | null>(null)

  async function saveChangedPresets(changedPresets: ChangedProjectLaunchPresets): Promise<string[] | undefined> {
    if (!onSaveSubmit) return []
    const savedPresets: string[] = []
    for (const [presetName, toggles] of Object.entries(changedPresets)) {
      const error = await onSaveSubmit(presetName, toggles)
      if (error) {
        setMessage({ text: error, color: 'red' })
        return undefined
      }
      savedPresets.push(presetName)
    }
    return savedPresets
  }

  async function runPromote(templateName: string, overwrite: boolean): Promise<void> {
    if (!onPromoteSubmit || activeItem?.type !== 'preset') return
    const outcome = await onPromoteSubmit(activeItem.name, templateName, overwrite)
    if (outcome.ok) {
      setMessage({ text: `Saved as global template ${templateName}`, color: 'yellow' })
      setMode('browse')
      return
    }
    if (outcome.conflict) {
      setPromoteName(templateName)
      setMode('promote-conflict')
      return
    }
    setPromoteError(outcome.error)
    setMode('promote')
  }

  useInput((input, key) => {
    // The panel owns its own keys once it is up, but while the scan is still
    // running nothing else is listening — and a scan waiting on an unresponsive
    // filesystem would otherwise leave the user with no way back.
    if (mode === 'import' && !importCandidates && (key.escape || input === 'q')) {
      setMode('browse')
      return
    }
    if (mode !== 'browse' || saveMode !== 'none' || state.pendingEnableUnlock) return
    if (input === 'q') {
      exit()
      return
    }

    const browserResult = controller.dispatchBrowserKey(input, key)
    if (browserResult.bubbledEscape) {
      exit()
      return
    }
    if (input === 't' && browserResult.handled) setMessage(null)
    if (browserResult.toggledDetected) {
      setMessage({ text: 'Press enter to create a new preset from Detected', color: 'yellow' })
    }
    if (browserResult.handled) return

    if (input === 'r') {
      if (activeItem?.type !== 'preset') {
        setMessage({ text: 'Detected cannot be renamed', color: 'yellow' })
        return
      }
      setRenameError(null)
      setNewName(activeItem.name)
      setMode('rename')
      return
    }
    if (input === 'd') {
      if (activeItem?.type !== 'preset') {
        setMessage({ text: 'Detected cannot be deleted', color: 'yellow' })
        return
      }
      setMode('delete')
      return
    }
    if (input === 's') {
      if (!onPromoteSubmit) return
      if (activeItem?.type !== 'preset') {
        setMessage({ text: 'Detected cannot be saved as a template', color: 'yellow' })
        return
      }
      // Promotion reads the preset back from disk, so unsaved toggles would be
      // silently left out of the template while the panel still reported success.
      if (activeItem.name in getChangedProjectLaunchPresets(state)) {
        setMessage({ text: 'Save this preset before saving it as a template', color: 'yellow' })
        return
      }
      setPromoteError(null)
      setPromoteName(activeItem.name)
      setMode('promote')
      return
    }
    if (input === 'i') {
      if (!onImportSubmit || !loadImportCandidates) return
      // A successful import refreshes the whole screen from disk, which would
      // take every unsaved toggle with it without ever saying so.
      if (state.dirty) {
        setMessage({ text: 'Save or discard your changes before importing', color: 'yellow' })
        return
      }
      setMessage(null)
      setImportCandidates(null)
      setMode('import')
      void loadImportCandidates().then(setImportCandidates, () => setImportCandidates([]))
      return
    }
    if (input === 'l' && !key.ctrl && !key.meta) {
      if (state.dirty) {
        if (activeItem?.type === 'preset') {
          const changedPresets = getChangedProjectLaunchPresets(state)
          if (onSaveSubmit) {
            void (async () => {
              const savedPresets = await saveChangedPresets(changedPresets)
              if (!savedPresets) return
              onSubmit({ type: 'launch', presetName: activeItem.name, toggles: activeToggleState, ...controller.disableRemovalsProps(), savedPresets })
              exit()
            })()
            return
          }
          onSubmit({ type: 'launch', presetName: activeItem.name, toggles: activeToggleState, ...controller.disableRemovalsProps(), ...changedProjectLaunchPresetProps(changedPresets) })
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
        toggles: activeToggleState,
        ...controller.disableRemovalsProps(),
        ...(activeItem?.type === 'preset' ? { presetName: activeItem.name } : {}),
      })
      exit()
      return
    }
    if (key.return) {
      if (!state.dirty) return
      if (activeItem?.type === 'preset') {
        if (onSaveSubmit) {
          void (async () => {
            const error = await onSaveSubmit(activeItem.name, activeToggleState)
            if (error) {
              setMessage({ text: error, color: 'red' })
              return
            }
            setMessage({ text: 'Preset saved successfully', color: 'yellow' })
          })()
          return
        }
        onSubmit({ type: 'save', presetName: activeItem.name, toggles: activeToggleState, ...controller.disableRemovalsProps() })
        exit()
        return
      }
      setMessage({ text: 'Press enter to create a new preset from Detected', color: 'yellow' })
      setNewName('')
      setSaveMode('name-new')
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
            const changedPresets = getChangedProjectLaunchPresets(state)
            if (onCreateSubmit) {
              const savedPresets = await saveChangedPresets(changedPresets)
              if (!savedPresets) return
              const error = await onCreateSubmit(saveAs, activeToggleState)
              if (error) {
                setMessage({ text: error, color: 'red' })
                return
              }
              controller.syncPresetState(current => syncProjectPresetCreate(current, saveAs))
              setMessage({ text: 'Preset created successfully', color: 'yellow' })
              setSaveMode('none')
              setNewName('')
              return
            }
            onSubmit({
              type: 'create',
              toggles: activeToggleState,
              saveAs,
              ...controller.disableRemovalsProps(),
              ...changedProjectLaunchPresetProps(changedPresets),
            })
            exit()
          }}
        />
      </Box>
    )
  }

  if (mode === 'import') {
    if (!importCandidates) {
      return (
        <Box flexDirection="column">
          <Text dimColor>Scanning global templates and recent projects…</Text>
        </Box>
      )
    }

    return (
      <ImportPanel
        candidates={importCandidates}
        onImport={async (id, targetName, overwrite) => (
          onImportSubmit
            ? onImportSubmit(id, targetName, overwrite)
            : { ok: false, error: 'Importing is unavailable' }
        )}
        onRenameTemplate={async (id, nextName) => (
          onTemplateRenameSubmit
            ? onTemplateRenameSubmit(id, nextName)
            : { ok: false, error: 'Renaming templates is unavailable' }
        )}
        onDeleteTemplate={async id => (
          onTemplateDeleteSubmit
            ? onTemplateDeleteSubmit(id)
            : { ok: false, error: 'Deleting templates is unavailable' }
        )}
        onClose={imported => {
          if (!imported) {
            setMode('browse')
            return
          }
          // The imported preset has to be re-detected against this project
          // before it can be shown, and that happens where detection lives.
          onSubmit({ type: 'refresh' })
          exit()
        }}
      />
    )
  }

  if (mode === 'promote-conflict') {
    return (
      <PresetConflictPrompt
        title="A global template with that name already exists"
        existingName={promoteName}
        onChoose={(choice: PresetConflictChoice) => {
          if (choice === 'cancel') {
            setMode('browse')
            return
          }
          if (choice === 'overwrite') {
            void runPromote(promoteName, true)
            return
          }
          setPromoteError(null)
          setMode('promote')
        }}
      />
    )
  }

  if (mode === 'promote') {
    return (
      <Box flexDirection="column">
        {promoteError ? <Text color="red">{promoteError}</Text> : <Text> </Text>}
        <TextInput
          label={`Save ${activeItem?.name ?? 'preset'} as global template`}
          value={promoteName}
          onChange={value => {
            setPromoteError(null)
            setPromoteName(value)
          }}
          onCancel={() => setMode('browse')}
          onSubmit={async () => {
            const templateName = promoteName.trim()
            if (!templateName) return
            await runPromote(templateName, false)
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
              controller.syncPresetState(current => syncProjectPresetRename(current, activeItem.name, newName.trim() || activeItem.name))
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
      <ProjectLaunchColumnsView {...columnsProps} minWidth={90} />
      {!columnsProps.toggleMessage && message ? <Text color={message.color}>{message.text}</Text> : null}
    </Box>
  )
}
