import { useMemo } from 'react'
import { Box, useStdout } from 'ink'
import type { SettingsSelectItem } from '../../flows/settings-select-flow.js'
import type { SettingsDisplayFormat } from '../../core/schema.js'
import { BORDERED_TITLE_BOX_FRAME_LINES, BorderedTitleBox } from './bordered-title-box.js'
import { countJsonTreeViewLines, JsonTreeView } from './json-tree-view.js'
import { countYamlTreeViewLines, YamlTreeView } from './yaml-tree-view.js'
import { useInkResizeVersion } from './resize-context.js'
import { TruncateText } from './truncate-text.js'

type Props = {
  title: string
  help: string
  items: SettingsSelectItem[]
  cursor: number
  envOnly?: boolean
  displayFormat?: SettingsDisplayFormat
}

type PreviewContent =
  | { kind: 'message'; text: string }
  | { kind: 'tree'; value: unknown }

function resolvePreviewContent(selected: SettingsSelectItem | undefined, envOnly: boolean): PreviewContent {
  if (!selected) return { kind: 'message', text: 'no settings found' }
  if (!envOnly) return { kind: 'tree', value: selected.settings }

  const env = (selected.settings as { env?: unknown }).env
  if (env === undefined) return { kind: 'message', text: 'no env configured' }
  return { kind: 'tree', value: { env } }
}

function countPreviewContentLines(content: PreviewContent, displayFormat: SettingsDisplayFormat): number {
  if (content.kind === 'message') return 1
  return displayFormat === 'json' ? countJsonTreeViewLines(content.value) : countYamlTreeViewLines(content.value)
}

function renderPreview(content: PreviewContent, displayFormat: SettingsDisplayFormat) {
  if (content.kind === 'message') return <TruncateText dimColor>{content.text}</TruncateText>
  const TreeView = displayFormat === 'json' ? JsonTreeView : YamlTreeView
  return <TreeView value={content.value} />
}

export function TwoColumnSettingsView({ title, help, items, cursor, envOnly = false, displayFormat = 'yaml' }: Props) {
  useInkResizeVersion()
  const { stdout } = useStdout()
  const fallbackColumns = 120
  const innerWidth = stdout.columns ?? fallbackColumns
  const listWidth = Math.max(20, Math.floor(innerWidth / 3))
  const previewWidth = Math.max(20, innerWidth - listWidth - 1)
  const selected = items[cursor]
  const previewContent = useMemo(() => resolvePreviewContent(selected, envOnly), [selected, envOnly])
  const previewContentLines = useMemo(
    () => countPreviewContentLines(previewContent, displayFormat),
    [previewContent, displayFormat],
  )
  const columnHeight = Math.max(
    items.length + BORDERED_TITLE_BOX_FRAME_LINES,
    previewContentLines + BORDERED_TITLE_BOX_FRAME_LINES,
  )

  return (
    <Box flexDirection="column">
      <TruncateText bold color="cyan">{title}</TruncateText>
      <TruncateText dimColor>{help}</TruncateText>
      <Box marginTop={0.5} width={innerWidth}>
        <Box marginRight={0.5}>
          <BorderedTitleBox title={`Settings(${items.length})`} width={listWidth} height={columnHeight} borderColor="cyan">
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
          </BorderedTitleBox>
        </Box>
        <BorderedTitleBox
          title={selected?.sourcePath ?? 'No settings selected'}
          width={previewWidth}
          height={columnHeight}
          borderColor="gray"
        >
          {renderPreview(previewContent, displayFormat)}
        </BorderedTitleBox>
      </Box>
    </Box>
  )
}
