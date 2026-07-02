import { useState } from 'react'
import { Text, useApp, useInput } from 'ink'
import {
  createSettingsSelectFlowState,
  formatSettingsSortMode,
  reduceSettingsSelectFlow,
  type SettingsSelectItem,
} from '../flows/settings-select-flow.js'
import type { SettingsDisplayFormat } from '../core/schema.js'
import { TwoColumnSettingsView } from './components/two-column-settings-view.js'

export type SettingsSelectResult = SettingsSelectItem

type Props = {
  items: SettingsSelectItem[]
  initialName?: string
  initialEnvOnly?: boolean
  displayFormat?: SettingsDisplayFormat
  headerNotice?: string
  headerUpdateNotice?: string
  onSubmit: (result: SettingsSelectResult) => void
}

export function SettingsSelectApp({ items, initialName, initialEnvOnly = false, displayFormat = 'yaml', headerNotice, headerUpdateNotice, onSubmit }: Props) {
  const { exit } = useApp()
  const [state, setState] = useState(() => createSettingsSelectFlowState({
    items,
    ...(initialName ? { initialName } : {}),
  }))
  const [envOnly, setEnvOnly] = useState(initialEnvOnly)
  const [sortMessage, setSortMessage] = useState<string | null>(null)

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit()
      return
    }

    if (input === 'f') setEnvOnly(current => !current)
    if (input === 't') {
      const nextState = reduceSettingsSelectFlow(state, { type: 'toggle-sort-mode' })
      setState(nextState)
      setSortMessage(formatSettingsSortMode(nextState.sortMode))
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
    <>
      {headerNotice ? (
        <Text>
          <Text dimColor>{headerNotice}</Text>
          {headerUpdateNotice ? <Text dimColor> · </Text> : null}
          {headerUpdateNotice ? <Text color="yellow">{headerUpdateNotice}</Text> : null}
        </Text>
      ) : null}
      <TwoColumnSettingsView
        title="Select Claude Code settings"
        help={`↑/k ↓/j navigate · enter select · t sort · f toggle ${envOnly ? 'full' : 'env'} · q quit`}
        items={state.items}
        cursor={state.cursor}
        envOnly={envOnly}
        displayFormat={displayFormat}
      />
      {sortMessage ? <Text color="yellow">{sortMessage}</Text> : null}
    </>
  )
}
