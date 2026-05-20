import { Box, useStdout } from 'ink'
import type { SettingsSelectItem } from '../../flows/settings-select-flow.js'
import { JsonTreeView } from './json-tree-view.js'
import { useInkResizeVersion } from './resize-context.js'
import { TruncateText } from './truncate-text.js'

type Props = {
  title: string
  help: string
  items: SettingsSelectItem[]
  cursor: number
}

export function TwoColumnSettingsView({ title, help, items, cursor }: Props) {
  useInkResizeVersion()
  const { stdout } = useStdout()
  const fallbackColumns = 120
  const innerWidth = stdout.columns ?? fallbackColumns
  const listWidth = Math.max(20, Math.floor(innerWidth / 3))
  const previewWidth = Math.max(20, innerWidth - listWidth - 1)
  const selected = items[cursor]

  return (
    <Box flexDirection="column">
      <TruncateText bold color="cyan">{title}</TruncateText>
      <TruncateText dimColor>{help}</TruncateText>
      <Box marginTop={0.5} width={innerWidth}>
        <Box
          flexDirection="column"
          width={listWidth}
          marginRight={0.5}
          borderStyle="round"
          borderColor="cyan"
          paddingX={0.5}
          paddingY={0.5}
        >
          <TruncateText bold>Settings({items.length})</TruncateText>
          {items.map((item, index) => (
            <TruncateText
              key={`${item.name}:${item.sourcePath}`}
              {...(index === cursor ? { color: 'cyan' as const } : {})}
            >
              {index === cursor ? '❯ ' : '  '}
              {item.name}
              {item.temporary ? ' (detected)' : ''}
            </TruncateText>
          ))}
        </Box>
        <Box
          flexDirection="column"
          width={previewWidth}
          borderStyle="round"
          borderColor="gray"
          paddingX={0.5}
          paddingY={0.5}
        >
          <TruncateText bold>{selected?.sourcePath ?? 'No settings selected'}</TruncateText>
          {selected ? <JsonTreeView value={selected.settings} /> : <TruncateText dimColor>no settings found</TruncateText>}
        </Box>
      </Box>
    </Box>
  )
}
