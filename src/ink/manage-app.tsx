import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { createSettingsSelectFlowState, reduceSettingsSelectFlow, type SettingsSelectItem } from '../flows/settings-select-flow.js'
import { TextInput } from './components/text-input.js'
import { TwoColumnSettingsView } from './components/two-column-settings-view.js'

export type ManageResult =
  | { type: 'launch'; item: SettingsSelectItem }
  | { type: 'rename'; item: SettingsSelectItem; newName: string }
  | { type: 'delete'; item: SettingsSelectItem }
  | { type: 'exit' }

export function ManageApp({ items, onSubmit }: { items: SettingsSelectItem[]; onSubmit: (result: ManageResult) => void }) {
  const { exit } = useApp()
  const [state, setState] = useState(() => createSettingsSelectFlowState({ items }))
  const [mode, setMode] = useState<'browse' | 'rename' | 'delete'>('browse')
  const [newName, setNewName] = useState('')
  const active = state.items[state.cursor]

  useInput((input, key) => {
    if (mode !== 'browse') return
    if (input === 'q') {
      onSubmit({ type: 'exit' })
      exit()
      return
    }
    if (key.upArrow || input === 'k') setState(current => reduceSettingsSelectFlow(current, { type: 'up' }))
    if (key.downArrow || input === 'j') setState(current => reduceSettingsSelectFlow(current, { type: 'down' }))
    if (input === 'l' || key.return) {
      if (!active) return
      onSubmit({ type: 'launch', item: active })
      exit()
    }
    if (input === 'r') setMode('rename')
    if (input === 'd') setMode('delete')
  })

  if (mode === 'rename') {
    return (
      <TextInput
        label={`Rename ${active?.name ?? 'preset'} to`}
        value={newName}
        onChange={setNewName}
        onCancel={() => setMode('browse')}
        onSubmit={() => {
          if (!active) return
          onSubmit({ type: 'rename', item: active, newName })
          exit()
        }}
      />
    )
  }

  if (mode === 'delete') {
    return (
      <Box flexDirection="column">
        <Text color="red">Delete preset {active?.name ?? 'preset'}?</Text>
        <Text dimColor>press y to confirm · esc cancel</Text>
        <ConfirmDelete
          onCancel={() => setMode('browse')}
          onConfirm={() => {
            if (!active) return
            onSubmit({ type: 'delete', item: active })
            exit()
          }}
        />
      </Box>
    )
  }

  return (
    <TwoColumnSettingsView
      title="Manage settings presets"
      help="↑/k ↓/j navigate · enter/l launch · r rename · d delete · q quit"
      items={state.items}
      cursor={state.cursor}
    />
  )
}

function ConfirmDelete({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useInput((input, key) => {
    if (input === 'y') onConfirm()
    if (input === 'n' || key.escape) onCancel()
  })
  return null
}
