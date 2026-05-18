import { Box, Text, useStdout } from 'ink'

import type { PresetMeta } from '../../core/schema.js'
import type { RunFlowSortMode } from '../../flows/run-flow.js'
import type { PluginState } from '../../services/plugin-service.js'
import type { SkillState } from '../../services/skill-service.js'

export type ThreeColumnFocus = 'settings' | 'plugins' | 'skills' | 'derived'

type Props = {
  title: string
  presets: PresetMeta[]
  plugins: PluginState[]
  skills: SkillState[]
  focus: ThreeColumnFocus
  settingsCursor: number
  pluginCursor: number
  skillCursor: number
  help: string
  sortMode?: RunFlowSortMode
}

function cursor(isFocused: boolean, isCurrent: boolean): string {
  return isFocused && isCurrent ? '❯ ' : '  '
}

function formatPresetLabel(preset: PresetMeta): string {
  if (preset.type === 'derived') {
    return `  └─ ${preset.name}`
  }

  return preset.name
}

function sourceBadge(source: PluginState['source'] | SkillState['source']): string {
  if (source === 'project-local') return '[L]'
  if (source === 'project') return '[P]'
  if (source === 'user') return '[U]'
  if (source === 'command') return '[C]'
  if (source === 'plugin') return '[PL]'
  return '[D]'
}

function countEnabled(items: Array<{ enabled: boolean }>): number {
  return items.filter(item => item.enabled).length
}

export function ThreeColumnView({ title, presets, plugins, skills, focus, settingsCursor, pluginCursor, skillCursor, help, sortMode = 'status' }: Props) {
  const { stdout } = useStdout()
  const fallbackColumns = 120
  const innerWidth = Math.max(90, (stdout.columns ?? fallbackColumns) - 6)
  const settingsWidth = Math.max(20, Math.floor(innerWidth / 5))
  const pluginsWidth = Math.max(24, Math.floor((innerWidth * 2) / 5))
  const skillsWidth = Math.max(24, innerWidth - settingsWidth - pluginsWidth)
  const enabledPlugins = countEnabled(plugins)
  const enabledSkills = countEnabled(skills)

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{title}</Text>
      <Text dimColor>{help}</Text>
      <Box marginTop={1} width={innerWidth}>
        <Box flexDirection="column" width={settingsWidth} marginRight={1} borderStyle="round" borderColor={focus === 'settings' || focus === 'derived' ? 'cyan' : 'gray'} paddingX={1}>
          <Text bold wrap="truncate-end">Settings({presets.filter(preset => preset.type === 'base').length})</Text>
          {presets.map((preset, index) => (
            <Text key={preset.name} wrap="truncate-end" {...(index === settingsCursor ? { color: 'cyan' as const } : {})}>
              {cursor(focus === 'settings' || focus === 'derived', index === settingsCursor)}{formatPresetLabel(preset)}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" width={pluginsWidth} marginRight={1} borderStyle="round" borderColor={focus === 'plugins' ? 'cyan' : 'gray'} paddingX={1}>
          <Text bold wrap="truncate-end">Plugins({enabledPlugins}/{plugins.length}){sortMode === 'name' ? ' · A-Z' : ''}</Text>
          {plugins.map((plugin, index) => (
            <Text key={plugin.name} wrap="truncate-end" {...(index === pluginCursor && focus === 'plugins' ? { color: 'cyan' as const } : {})}>
              {cursor(focus === 'plugins', index === pluginCursor)}<Text color={plugin.enabled ? 'green' : 'red'}>{plugin.enabled ? 'ON ' : 'OFF'}</Text> {sourceBadge(plugin.source)} {plugin.name}
            </Text>
          ))}
          {plugins.length === 0 ? <Text dimColor wrap="truncate-end">no plugins found</Text> : null}
        </Box>
        <Box flexDirection="column" width={skillsWidth} borderStyle="round" borderColor={focus === 'skills' ? 'cyan' : 'gray'} paddingX={1}>
          <Text bold wrap="truncate-end">Skills({enabledSkills}/{skills.length}){sortMode === 'name' ? ' · A-Z' : ''}</Text>
          {skills.map((skill, index) => (
            <Text key={skill.name} wrap="truncate-end" {...(index === skillCursor && focus === 'skills' ? { color: 'cyan' as const } : {})}>
              {cursor(focus === 'skills', index === skillCursor)}<Text color={skill.enabled ? 'green' : 'red'}>{skill.enabled ? 'ON ' : 'OFF'}</Text> {sourceBadge(skill.source)} {skill.name}{skill.toggleable ? '' : ' (plugin)'}
            </Text>
          ))}
          {skills.length === 0 ? <Text dimColor wrap="truncate-end">no skills found</Text> : null}
        </Box>
      </Box>
    </Box>
  )
}
