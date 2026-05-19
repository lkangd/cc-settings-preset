import { Box, Text, useStdout } from 'ink'
import type { SettingsSelectItem } from '../../flows/settings-select-flow.js'
import { JsonTreeView } from './json-tree-view.js'

type Props = {
  title: string
  help: string
  items: SettingsSelectItem[]
  cursor: number
}

export function TwoColumnSettingsView({ title, help, items, cursor }: Props) {
  const { stdout } = useStdout()
  const fallbackColumns = 120
  const innerWidth = Math.max(90, (stdout.columns ?? fallbackColumns) - 6)
  const listWidth = Math.max(24, Math.floor(innerWidth / 3))
  const previewWidth = innerWidth - listWidth - 1
  const selected = items[cursor]

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{title}</Text>
      <Text dimColor>{help}</Text>
      <Box marginTop={1} width={innerWidth}>
        <Box flexDirection="column" width={listWidth} marginRight={1} borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold>Settings({items.length})</Text>
          {items.map((item, index) => (
            <Text key={`${item.name}:${item.sourcePath}`} wrap="truncate-end" {...(index === cursor ? { color: 'cyan' as const } : {})}>
              {index === cursor ? '❯ ' : '  '}{item.name}{item.temporary ? ' (detected)' : ''}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column" width={previewWidth} borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold wrap="truncate-end">{selected?.sourcePath ?? 'No settings selected'}</Text>
          {selected ? <JsonTreeView value={selected.settings} /> : <Text dimColor>no settings found</Text>}
        </Box>
      </Box>
    </Box>
  )
}
