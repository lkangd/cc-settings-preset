import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import { createSettingsSelectFlowState, reduceSettingsSelectFlow, type SettingsSelectItem } from '../flows/settings-select-flow.js'
import type { SettingsDisplayFormat } from '../core/schema.js'
import { revealInFinder } from '../services/reveal-service.js'
import { TextInput } from './components/text-input.js'
import { TwoColumnSettingsView } from './components/two-column-settings-view.js'

export type ManageResult =
  | { type: 'launch'; item: SettingsSelectItem }
  | { type: 'rename'; item: SettingsSelectItem; newName: string }
  | { type: 'delete'; item: SettingsSelectItem }
  | { type: 'create' }
  | { type: 'refresh' }
  | { type: 'exit' }

type Props = {
  items: SettingsSelectItem[]
  displayFormat?: SettingsDisplayFormat
  onSubmit: (result: ManageResult) => void
  onRenameSubmit?: (item: SettingsSelectItem, newName: string) => Promise<string | null>
}

export function ManageApp({ items, displayFormat = 'yaml', onSubmit, onRenameSubmit }: Props) {
  const { exit } = useApp()
  const [state, setState] = useState(() => createSettingsSelectFlowState({ items }))
  const [mode, setMode] = useState<'browse' | 'rename' | 'delete'>('browse')
  const [newName, setNewName] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
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
    if (input === 'l' && !key.ctrl && !key.meta) {
      if (!active) return
      onSubmit({ type: 'launch', item: active })
      exit()
    }
    if (input === 'r') {
      setRenameError(null)
      setNewName(active?.name ?? '')
      setMode('rename')
    }
    if (input === 'd') setMode('delete')
    if (input === 'c') {
      onSubmit({ type: 'create' })
      exit()
    }
    if (input === 'o') revealInFinder(active?.sourcePath ?? '')
  })

  if (mode === 'rename') {
    return (
      <Box flexDirection="column">
        <Text color={renameError ? 'red' : ''}>{renameError ?? ' '}</Text>
        <TextInput
          label={`Rename ${active?.name ?? 'preset'} to`}
          value={newName}
          onChange={value => {
            setRenameError(null)
            setNewName(value)
          }}
          onCancel={() => setMode('browse')}
          onSubmit={async () => {
            if (!active) return
            if (onRenameSubmit) {
              const error = await onRenameSubmit(active, newName)
              if (error) {
                setRenameError(error)
                return
              }
              setState(current => ({
                ...current,
                items: current.items.map(item => item.name === active.name ? { ...item, name: newName } : item),
              }))
              setMessage('Preset renamed successfully')
              setMode('browse')
              return
            }
            onSubmit({ type: 'rename', item: active, newName })
            exit()
          }}
        />
      </Box>
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
    <Box flexDirection="column">
      <TwoColumnSettingsView
        title="Manage settings presets"
        help="↑/k ↓/j navigate · l launch · c create · o open folder · r rename · d delete · q quit"
        items={state.items}
        cursor={state.cursor}
        displayFormat={displayFormat}
      />
      {message ? <Text color="yellow">{message}</Text> : null}
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
