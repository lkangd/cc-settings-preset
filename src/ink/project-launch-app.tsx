import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import type { LaunchPresetMeta } from '../core/schema.js'
import {
  createProjectLaunchFlowState,
  getActiveProjectLaunchItem,
  getActiveProjectLaunchState,
  reduceProjectLaunchFlow,
  type ProjectLaunchToggleState
} from '../flows/project-launch-flow.js'
import type { McpState } from '../services/mcp-service.js'
import type { PluginState } from '../services/plugin-service.js'
import type { SkillState } from '../services/skill-service.js'
import { TextInput } from './components/text-input.js'

type SaveChoice = 'none' | 'confirm-save' | 'name-new'

export type ProjectLaunchResult =
  | { type: 'launch'; presetName?: string; toggles: ProjectLaunchToggleState; saveAs?: string }
  | { type: 'temp-launch'; toggles: ProjectLaunchToggleState }

export type ProjectLaunchAppProps = {
  presets: LaunchPresetMeta[]
  detected: ProjectLaunchToggleState
  statesByPreset: Record<string, ProjectLaunchToggleState>
  lastUsedName?: string
  onSubmit: (result: ProjectLaunchResult) => void
}

function enabledCount(items: Array<{ enabled: boolean }>): number {
  return items.filter(item => item.enabled).length
}

function sourceBadge(source: PluginState['source'] | SkillState['source'] | McpState['source']): string {
  if (source === 'project-local') return '[L]'
  if (source === 'project') return '[P]'
  if (source === 'user') return '[U]'
  if (source === 'command') return '[C]'
  if (source === 'plugin') return '[PL]'
  if (source === 'local') return '[L]'
  if (source === 'connector') return '[CN]'
  return '[D]'
}

export function ProjectLaunchApp({ presets, detected, statesByPreset, lastUsedName, onSubmit }: ProjectLaunchAppProps) {
  const { exit } = useApp()
  const [state, setState] = useState(() =>
    createProjectLaunchFlowState({
      presets,
      detected,
      statesByPreset,
      ...(lastUsedName ? { lastUsedName } : {})
    })
  )
  const [saveChoice, setSaveChoice] = useState<SaveChoice>('none')
  const [newName, setNewName] = useState('')

  function submitLaunch(saveAs?: string) {
    const normalizedSaveAs = saveAs?.trim()
    if (saveAs !== undefined && !normalizedSaveAs) return

    const item = getActiveProjectLaunchItem(state)
    const toggles = getActiveProjectLaunchState(state)
    onSubmit({
      type: 'launch',
      toggles,
      ...(item?.type === 'preset' ? { presetName: item.name } : {}),
      ...(normalizedSaveAs ? { saveAs: normalizedSaveAs } : {})
    })
    exit()
  }

  useInput((input, key) => {
    if (saveChoice !== 'none') return
    if (input === 'q') {
      exit()
      return
    }
    if (key.leftArrow || input === 'h') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-left' }))
    if (key.rightArrow || input === 'l') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-right' }))
    if (key.upArrow || input === 'k') setState(current => reduceProjectLaunchFlow(current, { type: 'up' }))
    if (key.downArrow || input === 'j') setState(current => reduceProjectLaunchFlow(current, { type: 'down' }))
    if (input === 'p') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-plugins' }))
    if (input === 's') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-skills' }))
    if (input === 'm') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-mcps' }))
    if (input === 't') setState(current => reduceProjectLaunchFlow(current, { type: 'toggle-sort-mode' }))
    if (input === ' ') setState(current => reduceProjectLaunchFlow(current, { type: 'toggle-current' }))
    if (key.return) {
      if (state.dirty) {
        setSaveChoice('confirm-save')
        return
      }
      submitLaunch()
    }
  })

  if (saveChoice === 'confirm-save') {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Save changes as a new project launch preset?</Text>
        <Text dimColor>press Y to save · n for retained temp settings · esc cancel</Text>
        <ConfirmSaveChoice
          onSave={() => setSaveChoice('name-new')}
          onTemp={() => {
            onSubmit({ type: 'temp-launch', toggles: getActiveProjectLaunchState(state) })
            exit()
          }}
          onCancel={() => setSaveChoice('none')}
        />
      </Box>
    )
  }

  if (saveChoice === 'name-new') {
    return (
      <TextInput
        label="Project launch preset name"
        value={newName}
        onChange={setNewName}
        onCancel={() => setSaveChoice('confirm-save')}
        onSubmit={() => submitLaunch(newName)}
      />
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        Select project launch preset
      </Text>
      <Text dimColor>
        ←/→ switch column · p plugins · s skills · m mcps · t sort · space toggle · enter launch · q quit
      </Text>
      <Box marginTop={0.5}>
        <Box
          flexDirection="column"
          width={22}
          marginRight={0.5}
          borderStyle="round"
          borderColor={state.focus === 'presets' ? 'cyan' : 'gray'}
          paddingX={0.5}
          paddingY={0.5}
        >
          <Text bold>Presets({state.presetItems.length})</Text>
          {state.presetItems.map((item, index) => (
            <Text
              key={item.name}
              wrap="truncate-end"
              {...(index === state.presetCursor ? { color: 'cyan' as const } : {})}
            >
              {state.focus === 'presets' && index === state.presetCursor ? '❯ ' : '  '}
              {item.name}
            </Text>
          ))}
        </Box>
        <ToggleColumn
          title={`Plugins(${enabledCount(state.plugins)}/${state.plugins.length})`}
          focused={state.focus === 'plugins'}
          items={state.plugins}
          cursor={state.pluginCursor}
        />
        <ToggleColumn
          title={`Skills(${enabledCount(state.skills)}/${state.skills.length})`}
          focused={state.focus === 'skills'}
          items={state.skills}
          cursor={state.skillCursor}
        />
        <ToggleColumn
          title={`MCPs(${enabledCount(state.mcps)}/${state.mcps.length})`}
          focused={state.focus === 'mcps'}
          items={state.mcps}
          cursor={state.mcpCursor}
        />
      </Box>
    </Box>
  )
}

function ToggleColumn({
  title,
  focused,
  items,
  cursor
}: {
  title: string
  focused: boolean
  items: Array<{
    name: string
    enabled: boolean
    source: PluginState['source'] | SkillState['source'] | McpState['source']
    toggleable?: boolean
  }>
  cursor: number
}) {
  return (
    <Box
      flexDirection="column"
      width={28}
      marginRight={0.5}
      borderStyle="round"
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={0.5}
      paddingY={0.5}
    >
      <Text bold>{title}</Text>
      {items.map((item, index) => (
        <Text key={item.name} wrap="truncate-end" {...(focused && index === cursor ? { color: 'cyan' as const } : {})}>
          {focused && index === cursor ? '❯ ' : '  '}
          <Text color={item.enabled ? 'green' : 'red'}>{item.enabled ? 'ON ' : 'OFF'}</Text> {sourceBadge(item.source)}{' '}
          {item.name}
          {item.toggleable === false ? ' (plugin)' : ''}
        </Text>
      ))}
      {items.length === 0 ? <Text dimColor>none found</Text> : null}
    </Box>
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
