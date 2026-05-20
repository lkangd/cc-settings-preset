import { useState } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import {
  createProjectLaunchFlowState,
  getActiveProjectLaunchItem,
  getActiveProjectLaunchState,
  reduceProjectLaunchFlow,
} from '../flows/project-launch-flow.js'
import type { McpState } from '../services/mcp-service.js'
import type { PluginState } from '../services/plugin-service.js'
import type { SkillState } from '../services/skill-service.js'
import { TextInput } from './components/text-input.js'
import type { ProjectLaunchAppProps, ProjectLaunchResult } from './project-launch-app.js'

export type ProjectManageResult =
  | ProjectLaunchResult
  | { type: 'rename'; presetName: string; newName: string }
  | { type: 'delete'; presetName: string }

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

type Props = Omit<ProjectLaunchAppProps, 'onSubmit'> & {
  onSubmit: (result: ProjectManageResult) => void
}

export function ProjectManageApp({ presets, detected, statesByPreset, lastUsedName, onSubmit }: Props) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const fallbackColumns = 120
  const innerWidth = Math.max(90, stdout.columns ?? fallbackColumns)
  const gapWidth = 3
  const contentWidth = innerWidth - gapWidth
  const presetWidth = Math.max(22, Math.floor(contentWidth * 0.22))
  const detailWidth = Math.max(24, Math.floor((contentWidth - presetWidth) / 3))
  const mcpWidth = contentWidth - presetWidth - detailWidth - detailWidth
  const [state, setState] = useState(() => createProjectLaunchFlowState({
    presets,
    detected,
    statesByPreset,
    ...(lastUsedName ? { lastUsedName } : {}),
  }))
  const [mode, setMode] = useState<'browse' | 'rename' | 'delete'>('browse')
  const [message, setMessage] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  useInput((input, key) => {
    if (mode !== 'browse') return
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
    if (input === 'r') {
      const item = getActiveProjectLaunchItem(state)
      if (item?.type !== 'preset') {
        setMessage('Detected cannot be renamed')
        return
      }
      setMode('rename')
      return
    }
    if (input === 'd') {
      const item = getActiveProjectLaunchItem(state)
      if (item?.type !== 'preset') {
        setMessage('Detected cannot be deleted')
        return
      }
      setMode('delete')
      return
    }
    if (key.return) {
      onSubmit({ type: 'launch', toggles: getActiveProjectLaunchState(state) })
      exit()
    }
  })

  const activeItem = getActiveProjectLaunchItem(state)

  if (mode === 'rename') {
    return (
      <TextInput
        label={`Rename ${activeItem?.name ?? 'preset'} to`}
        value={newName}
        onChange={setNewName}
        onCancel={() => setMode('browse')}
        onSubmit={() => {
          if (activeItem?.type !== 'preset') return
          onSubmit({ type: 'rename', presetName: activeItem.name, newName })
          exit()
        }}
      />
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
      <Text bold color="cyan">Manage project launch presets</Text>
      <Text dimColor>←/→ switch column · p plugins · s skills · m mcps · t sort · space toggle · enter launch · r rename · d delete · q quit</Text>
      <Box marginTop={1} width={innerWidth}>
        <Box flexDirection="column" width={presetWidth} borderStyle="round" borderColor={state.focus === 'presets' ? 'cyan' : 'gray'} paddingX={0.5} paddingY={0.5}>
          <Text bold>Presets({state.presetItems.length})</Text>
          {state.presetItems.map((item, index) => (
            <Text key={item.name} wrap="truncate-end" {...(index === state.presetCursor ? { color: 'cyan' as const } : {})}>
              {state.focus === 'presets' && index === state.presetCursor ? '❯ ' : '  '}{item.name}
            </Text>
          ))}
        </Box>
        <Box width={1} />
        <ToggleColumn title={`Plugins(${enabledCount(state.plugins)}/${state.plugins.length})`} focused={state.focus === 'plugins'} items={state.plugins} cursor={state.pluginCursor} width={detailWidth} />
        <Box width={1} />
        <ToggleColumn title={`Skills(${enabledCount(state.skills)}/${state.skills.length})`} focused={state.focus === 'skills'} items={state.skills} cursor={state.skillCursor} width={detailWidth} />
        <Box width={1} />
        <ToggleColumn title={`MCPs(${enabledCount(state.mcps)}/${state.mcps.length})`} focused={state.focus === 'mcps'} items={state.mcps} cursor={state.mcpCursor} width={mcpWidth} />
      </Box>
      {message ? <Text color="yellow">{message}</Text> : null}
    </Box>
  )
}

function ToggleColumn({ title, focused, items, cursor, width }: { title: string; focused: boolean; items: Array<{ name: string; enabled: boolean; source: PluginState['source'] | SkillState['source'] | McpState['source']; toggleable?: boolean }>; cursor: number; width: number }) {
  return (
    <Box flexDirection="column" width={width} borderStyle="round" borderColor={focused ? 'cyan' : 'gray'} paddingX={0.5} paddingY={0.5}>
      <Text bold>{title}</Text>
      {items.map((item, index) => (
        <Text key={item.name} wrap="truncate-end" {...(focused && index === cursor ? { color: 'cyan' as const } : {})}>
          {focused && index === cursor ? '❯ ' : '  '}<Text color={item.enabled ? 'green' : 'red'}>{item.enabled ? 'ON ' : 'OFF'}</Text> {sourceBadge(item.source)} {item.name}{item.toggleable === false ? ' (plugin)' : ''}
        </Text>
      ))}
      {items.length === 0 ? <Text dimColor>none found</Text> : null}
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
