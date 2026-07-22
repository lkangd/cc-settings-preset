import { useMemo, useRef, useState } from 'react'
import { Text, useApp, useInput } from 'ink'
import {
  applyQuickSettingsDraft,
  createSettingsSelectFlowState,
  formatSettingsSortMode,
  reduceSettingsSelectFlow,
  resolveEffortLaunchArg,
  resolveQuickSettingDisplays,
  type EffortLevel,
  type QuickSettingsDraft,
  type QuickSettingsSource,
  type SettingsSelectFlowState,
  type SettingsSelectItem,
} from '../flows/settings-select-flow.js'
import type { SettingsDisplayFormat } from '../core/schema.js'
import { TwoColumnSettingsView } from './components/two-column-settings-view.js'

export type SettingsSelectResult = SettingsSelectItem & {
  changedPresets?: Record<string, QuickSettingsDraft>
  effortArg?: EffortLevel
}

type Props = {
  items: SettingsSelectItem[]
  initialName?: string
  initialEnvOnly?: boolean
  displayFormat?: SettingsDisplayFormat
  quickSettingsSources?: QuickSettingsSource[]
  headerNotice?: string
  headerUpdateNotice?: string
  onSubmit: (result: SettingsSelectResult) => void
}

export function SettingsSelectApp({
  items,
  initialName,
  initialEnvOnly = false,
  displayFormat = 'yaml',
  quickSettingsSources = [],
  headerNotice,
  headerUpdateNotice,
  onSubmit,
}: Props) {
  const { exit } = useApp()
  const [state, setState] = useState(() => createSettingsSelectFlowState({
    items,
    quickSettingsSources,
    ...(initialName ? { initialName } : {}),
  }))
  const stateRef = useRef(state)
  stateRef.current = state
  const [envOnly, setEnvOnly] = useState(initialEnvOnly)
  const [sortMessage, setSortMessage] = useState<string | null>(null)

  const updateState = (updater: (current: SettingsSelectFlowState) => SettingsSelectFlowState) => {
    const nextState = updater(stateRef.current)
    stateRef.current = nextState
    setState(nextState)
    return nextState
  }

  useInput((input, key) => {
    if (key.escape) {
      // From the quick settings column, Esc first returns focus to the presets column.
      if (stateRef.current.focus === 'quick-settings') {
        updateState(current => reduceSettingsSelectFlow(current, { type: 'focus-left' }))
        return
      }
      exit()
      return
    }
    if (input === 'q') {
      exit()
      return
    }

    if (input === 'f') {
      setEnvOnly(current => !current)
      return
    }
    if (input === 't') {
      const nextState = updateState(current => reduceSettingsSelectFlow(current, { type: 'toggle-sort-mode' }))
      setSortMessage(formatSettingsSortMode(nextState.sortMode))
      return
    }
    if (key.leftArrow || input === 'h') {
      updateState(current => reduceSettingsSelectFlow(current, { type: 'focus-left' }))
      return
    }
    if (key.rightArrow || input === 'l') {
      updateState(current => reduceSettingsSelectFlow(current, { type: 'focus-right' }))
      return
    }
    if (key.upArrow || input === 'k') {
      updateState(current => reduceSettingsSelectFlow(current, { type: 'up' }))
      return
    }
    if (key.downArrow || input === 'j') {
      updateState(current => reduceSettingsSelectFlow(current, { type: 'down' }))
      return
    }
    if (input === ' ') {
      // Only cycle when the quick settings column is focused, so space never silently edits a
      // row that shows no ❯ cursor.
      if (stateRef.current.focus === 'quick-settings') {
        updateState(current => reduceSettingsSelectFlow(current, { type: 'cycle-current' }))
      }
      return
    }

    if (key.return) {
      const current = stateRef.current
      const selected = current.items[current.cursor]
      if (!selected) return
      const effortArg = resolveEffortLaunchArg(current.draftsByPreset[selected.name])
      onSubmit({
        ...selected,
        settings: applyQuickSettingsDraft(selected.settings, current.draftsByPreset[selected.name]),
        ...(Object.keys(current.draftsByPreset).length > 0
          ? { changedPresets: current.draftsByPreset }
          : {}),
        ...(effortArg ? { effortArg } : {}),
      })
      exit()
    }
  })

  const viewItems = useMemo(
    () => state.items.map(item => ({
      ...item,
      settings: applyQuickSettingsDraft(item.settings, state.draftsByPreset[item.name]),
    })),
    [state.items, state.draftsByPreset],
  )

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
        help={`←/h →/l switch column · ↑/k ↓/j navigate · space cycle · enter select · t sort · f toggle ${envOnly ? 'full' : 'env'} · q quit`}
        items={viewItems}
        cursor={state.cursor}
        envOnly={envOnly}
        displayFormat={displayFormat}
        quickSettings={{
          focus: state.focus,
          cursor: state.quickCursor,
          items: resolveQuickSettingDisplays(state),
          modifiedPresetNames: Object.keys(state.draftsByPreset),
        }}
      />
      {sortMessage ? <Text color="yellow">{sortMessage}</Text> : null}
    </>
  )
}
