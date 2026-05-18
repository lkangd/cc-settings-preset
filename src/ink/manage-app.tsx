import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'

import type { PresetMeta } from '../core/schema.js'
import { createManageFlowState, reduceManageFlow } from '../flows/manage-flow.js'
import type { PluginState } from '../services/plugin-service.js'
import type { SkillState } from '../services/skill-service.js'
import { TextInput } from './components/text-input.js'
import { ThreeColumnView } from './components/three-column-view.js'

export type ManageResult =
  | { type: 'launch'; preset: PresetMeta }
  | { type: 'rename'; preset: PresetMeta; newName: string }
  | { type: 'delete'; preset: PresetMeta }
  | { type: 'exit' }

type Props = {
  presets: PresetMeta[]
  pluginsByPreset: Record<string, PluginState[]>
  skillsByPreset: Record<string, SkillState[]>
  onSubmit: (result: ManageResult) => void
}

export function ManageApp({ presets, pluginsByPreset, skillsByPreset, onSubmit }: Props) {
  const { exit } = useApp()
  const [state, setState] = useState(() => createManageFlowState(presets))
  const [newName, setNewName] = useState('')
  const active = state.presets[state.cursor]
  const activePlugins = active ? (pluginsByPreset[active.name] ?? []) : []
  const activeSkills = active ? (skillsByPreset[active.name] ?? []) : []

  useInput((input, key) => {
    if (state.mode !== 'browsing') return

    if (input === 'q' || key.escape) {
      onSubmit({ type: 'exit' })
      exit()
      return
    }

    if (key.upArrow || input === 'k') setState(current => reduceManageFlow(current, { type: 'up' }))
    if (key.downArrow || input === 'j') setState(current => reduceManageFlow(current, { type: 'down' }))
    if (input === 'r') setState(current => reduceManageFlow(current, { type: 'rename' }))
    if (input === 'd') setState(current => reduceManageFlow(current, { type: 'delete' }))

    if (input === 'l' || key.return) {
      if (!active) return
      onSubmit({ type: 'launch', preset: active })
      exit()
    }
  })

  if (state.mode === 'renaming') {
    return (
      <TextInput
        label={`Rename ${active?.name ?? 'preset'} to`}
        value={newName}
        placeholder="new-name"
        onChange={setNewName}
        onCancel={() => setState(current => reduceManageFlow(current, { type: 'escape' }))}
        onSubmit={() => {
          if (!active) return
          onSubmit({ type: 'rename', preset: active, newName })
          exit()
        }}
      />
    )
  }

  if (state.mode === 'confirm-delete') {
    return (
      <Box flexDirection="column">
        <Text color="red">Delete preset {active?.name ?? 'preset'}?</Text>
        <Text dimColor>press y to confirm · esc cancel</Text>
        <ConfirmDelete
          onCancel={() => setState(current => reduceManageFlow(current, { type: 'escape' }))}
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
    <ThreeColumnView
      title="Manage settings presets"
      help="↑/k ↓/j navigate · enter/l launch · r rename · d delete · q quit"
      presets={state.presets}
      plugins={activePlugins}
      skills={activeSkills}
      focus="settings"
      settingsCursor={state.cursor}
      pluginCursor={0}
      skillCursor={0}
      sortMode="status"
    />
  )
}

function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useInput((input, key) => {
    if (input === 'y') onConfirm()
    if (key.escape || input === 'n') onCancel()
  })

  return null
}
