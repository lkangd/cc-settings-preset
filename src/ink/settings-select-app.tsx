import { useState } from 'react'
import { useApp, useInput } from 'ink'
import { createSettingsSelectFlowState, reduceSettingsSelectFlow, type SettingsSelectItem } from '../flows/settings-select-flow.js'
import { TwoColumnSettingsView } from './components/two-column-settings-view.js'

export type SettingsSelectResult = SettingsSelectItem

type Props = {
  items: SettingsSelectItem[]
  initialName?: string
  onSubmit: (result: SettingsSelectResult) => void
}

export function SettingsSelectApp({ items, initialName, onSubmit }: Props) {
  const { exit } = useApp()
  const [state, setState] = useState(() => createSettingsSelectFlowState({ items, initialName }))

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit()
      return
    }

    if (key.upArrow || input === 'k') setState(current => reduceSettingsSelectFlow(current, { type: 'up' }))
    if (key.downArrow || input === 'j') setState(current => reduceSettingsSelectFlow(current, { type: 'down' }))

    if (key.return) {
      const selected = state.items[state.cursor]
      if (!selected) return
      onSubmit(selected)
      exit()
    }
  })

  return (
    <TwoColumnSettingsView
      title="Select Claude Code settings"
      help="↑/k ↓/j navigate · enter select · q quit"
      items={state.items}
      cursor={state.cursor}
    />
  )
}
