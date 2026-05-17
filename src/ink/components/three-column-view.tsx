import { Box, Text } from 'ink'

import type { PresetMeta } from '../../core/schema.js'
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
}

function cursor(isFocused: boolean, isCurrent: boolean): string {
  return isFocused && isCurrent ? '❯ ' : '  '
}

export function ThreeColumnView({ title, presets, plugins, skills, focus, settingsCursor, pluginCursor, skillCursor, help }: Props) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{title}</Text>
      <Text dimColor>{help}</Text>
      <Box marginTop={1}>
        <Box flexDirection="column" width={28} marginRight={1} borderStyle="round" borderColor={focus === 'settings' || focus === 'derived' ? 'cyan' : 'gray'} paddingX={1}>
          <Text bold>Settings</Text>
          {presets.map((preset, index) => (
            <Text key={preset.name} {...(index === settingsCursor ? { color: 'cyan' as const } : {})}>
              {cursor(focus === 'settings' || focus === 'derived', index === settingsCursor)}{preset.name}{preset.type === 'derived' ? ' (derived)' : ''}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" width={30} marginRight={1} borderStyle="round" borderColor={focus === 'plugins' ? 'cyan' : 'gray'} paddingX={1}>
          <Text bold>Plugins</Text>
          {plugins.map((plugin, index) => (
            <Text key={plugin.name} {...(index === pluginCursor && focus === 'plugins' ? { color: 'cyan' as const } : {})}>
              {cursor(focus === 'plugins', index === pluginCursor)}{plugin.enabled ? 'ON ' : 'OFF'} {plugin.name}
            </Text>
          ))}
          {plugins.length === 0 ? <Text dimColor>no plugins found</Text> : null}
        </Box>
        <Box flexDirection="column" width={36} borderStyle="round" borderColor={focus === 'skills' ? 'cyan' : 'gray'} paddingX={1}>
          <Text bold>Skills</Text>
          {skills.map((skill, index) => (
            <Text key={skill.name} {...(index === skillCursor && focus === 'skills' ? { color: 'cyan' as const } : {})}>
              {cursor(focus === 'skills', index === skillCursor)}{skill.enabled ? 'ON ' : 'OFF'} {skill.name}{skill.toggleable ? '' : ' (plugin)'}
            </Text>
          ))}
          {skills.length === 0 ? <Text dimColor>no skills found</Text> : null}
        </Box>
      </Box>
    </Box>
  )
}
