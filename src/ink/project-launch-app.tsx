import { useState } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { TruncateText } from './components/truncate-text.js'
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
import { useInkResizeVersion } from './components/resize-context.js'
import { TextInput } from './components/text-input.js'
import { normalizePresetName } from '../core/name.js'

type SaveChoice = 'none' | 'confirm-save' | 'name-new'

export type ProjectLaunchResult =
  | { type: 'launch'; presetName?: string; toggles: ProjectLaunchToggleState; saveAs?: string }
  | { type: 'temp-launch'; toggles: ProjectLaunchToggleState }
  | { type: 'back' }

export type ProjectLaunchAppProps = {
  presets: LaunchPresetMeta[]
  detected: ProjectLaunchToggleState
  statesByPreset: Record<string, ProjectLaunchToggleState>
  lastUsedName?: string
  onSubmit: (result: ProjectLaunchResult) => void
  onCreateSubmit?: (saveAs: string, toggles: ProjectLaunchToggleState) => Promise<string | null>
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

export function ProjectLaunchApp({ presets, detected, statesByPreset, lastUsedName, onSubmit, onCreateSubmit }: ProjectLaunchAppProps) {
  useInkResizeVersion()
  const { exit } = useApp()
  const { stdout } = useStdout()
  const fallbackColumns = 120
  const innerWidth = stdout.columns ?? fallbackColumns
  const gapWidth = 3
  const contentWidth = innerWidth - gapWidth
  const presetWidth = Math.max(22, Math.floor(contentWidth * 0.22))
  const detailWidth = Math.max(24, Math.floor((contentWidth - presetWidth) / 3))
  const mcpWidth = contentWidth - presetWidth - detailWidth - detailWidth
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
  const [createError, setCreateError] = useState<string | null>(null)

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
    if (key.rightArrow || (input === 'l' && !key.ctrl && !key.meta)) setState(current => reduceProjectLaunchFlow(current, { type: 'focus-right' }))
    if (key.upArrow || input === 'k') setState(current => reduceProjectLaunchFlow(current, { type: 'up' }))
    if (key.downArrow || input === 'j') setState(current => reduceProjectLaunchFlow(current, { type: 'down' }))
    if (input === 'p') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-plugins' }))
    if (input === 's') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-skills' }))
    if (input === 'm') setState(current => reduceProjectLaunchFlow(current, { type: 'focus-mcps' }))
    if (key.escape) {
      if (state.focus === 'presets') {
        onSubmit({ type: 'back' })
        exit()
        return
      }
      setState(current => reduceProjectLaunchFlow(current, { type: 'focus-presets' }))
    }
    if (input === 't') setState(current => reduceProjectLaunchFlow(current, { type: 'toggle-sort-mode' }))
    if (input === ' ') setState(current => reduceProjectLaunchFlow(current, { type: 'toggle-current' }))
    if (key.return) {
      if (state.dirty) {
        const item = getActiveProjectLaunchItem(state)
        if (item?.type === 'preset') {
          submitLaunch()
          return
        }
        setSaveChoice('confirm-save')
        return
      }
      submitLaunch()
    }
  })

  if (saveChoice === 'confirm-save') {
    return (
      <Box flexDirection="column">
        <TruncateText color="yellow">Save changes as a new project launch preset?</TruncateText>
        <TruncateText dimColor>press Y to save · n for retained temp settings · esc cancel</TruncateText>
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
      <Box flexDirection="column">
        {createError ? <TruncateText color="red">{createError}</TruncateText> : null}
        <TextInput
          label="Project launch preset name"
          value={newName}
          onChange={value => {
            setCreateError(null)
            setNewName(value)
          }}
          onCancel={() => {
            setCreateError(null)
            setSaveChoice('confirm-save')
          }}
          onSubmit={async () => {
            const saveAs = newName.trim()
            if (!saveAs) return
            if (onCreateSubmit) {
              const error = await onCreateSubmit(saveAs, getActiveProjectLaunchState(state))
              if (error) {
                setCreateError(error)
                return
              }
              onSubmit({
                type: 'launch',
                presetName: normalizePresetName(saveAs, { preserveCase: true }),
                toggles: getActiveProjectLaunchState(state),
              })
              exit()
              return
            }
            submitLaunch(newName)
          }}
        />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <TruncateText bold color="cyan">Select project launch preset</TruncateText>
      <TruncateText dimColor>←/→ switch column · p plugins · s skills · m mcps · t sort · space toggle · enter launch · esc presets/back · q quit</TruncateText>
      <Box marginTop={0.5} width={innerWidth}>
        <Box
          flexDirection="column"
          width={presetWidth}
          borderStyle="round"
          borderColor={state.focus === 'presets' ? 'cyan' : 'gray'}
          paddingX={0.5}
          paddingY={0.5}
        >
          <TruncateText bold>Presets({state.presetItems.length})</TruncateText>
          {state.presetItems.map((item, index) => (
            <TruncateText
              key={item.name}
              {...(index === state.presetCursor ? { color: 'cyan' as const } : {})}
            >
              {state.focus === 'presets' && index === state.presetCursor ? '❯ ' : '  '}
              {item.name}
            </TruncateText>
          ))}
        </Box>
        <Box width={1} />
        <ToggleColumn
          title={`Plugins(${enabledCount(state.plugins)}/${state.plugins.length})`}
          focused={state.focus === 'plugins'}
          items={state.plugins}
          cursor={state.pluginCursor}
          width={detailWidth}
        />
        <Box width={1} />
        <ToggleColumn
          title={`Skills(${enabledCount(state.skills)}/${state.skills.length})`}
          focused={state.focus === 'skills'}
          items={state.skills}
          cursor={state.skillCursor}
          width={detailWidth}
        />
        <Box width={1} />
        <ToggleColumn
          title={`MCPs(${enabledCount(state.mcps)}/${state.mcps.length})`}
          focused={state.focus === 'mcps'}
          items={state.mcps}
          cursor={state.mcpCursor}
          width={mcpWidth}
        />
      </Box>
    </Box>
  )
}

function ToggleColumn({
  title,
  focused,
  items,
  cursor,
  width
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
  width: number
}) {
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={0.5}
      paddingY={0.5}
    >
      <TruncateText bold>{title}</TruncateText>
      {items.map((item, index) => (
        <TruncateText key={item.name} {...(focused && index === cursor ? { color: 'cyan' as const } : {})}>
          {focused && index === cursor ? '❯ ' : '  '}
          <Text color={item.enabled ? 'green' : 'red'}>{item.enabled ? 'ON ' : 'OFF'}</Text> {sourceBadge(item.source)}{' '}
          {item.name}
          {item.toggleable === false ? ' (plugin)' : ''}
        </TruncateText>
      ))}
      {items.length === 0 ? <TruncateText dimColor>none found</TruncateText> : null}
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
