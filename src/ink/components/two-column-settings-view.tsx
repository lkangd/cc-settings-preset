import { useMemo } from 'react'
import { Box, Text, useStdout } from 'ink'
import type {
  QuickSettingDisplay,
  SettingsSelectFocus,
  SettingsSelectItem,
} from '../../flows/settings-select-flow.js'
import type { SettingsDisplayFormat } from '../../core/schema.js'
import { BORDERED_TITLE_BOX_FRAME_LINES, BorderedTitleBox } from './bordered-title-box.js'
import { countJsonTreeViewLines, JsonTreeView } from './json-tree-view.js'
import { countYamlTreeViewLines, YamlTreeView } from './yaml-tree-view.js'
import { useInkResizeVersion } from './resize-context.js'
import { TruncateText } from './truncate-text.js'
import { QuickSettingValue } from './quick-setting-value.js'
import { computeProjectLaunchColumnWidths } from './project-launch-columns-view.js'

type QuickSettingsProps = {
  focus: SettingsSelectFocus
  cursor: number
  items: QuickSettingDisplay[]
  modifiedPresetNames?: string[]
}

type Props = {
  title: string
  help: string
  items: SettingsSelectItem[]
  cursor: number
  envOnly?: boolean
  displayFormat?: SettingsDisplayFormat
  quickSettings?: QuickSettingsProps
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

export function computeSettingsColumnWidths(innerWidth: number, showQuickSettings: boolean): {
  listWidth: number
  quickWidth?: number
  previewWidth: number
} {
  if (!showQuickSettings) {
    const listWidth = Math.max(20, Math.floor(innerWidth / 3))
    return { listWidth, previewWidth: Math.max(20, innerWidth - listWidth - 1) }
  }

  // The settings column matches the project launch Presets column, and the quick settings column
  // matches its toggle (Plugins/Skills/MCPs) columns.
  const { presetWidth, detailWidth } = computeProjectLaunchColumnWidths(innerWidth)
  return {
    listWidth: presetWidth,
    quickWidth: detailWidth,
    previewWidth: Math.max(20, innerWidth - presetWidth - detailWidth - 2),
  }
}

export function TwoColumnSettingsView({
  title,
  help,
  items,
  cursor,
  envOnly = false,
  displayFormat = 'yaml',
  quickSettings,
}: Props) {
  useInkResizeVersion()
  const { stdout } = useStdout()
  const fallbackColumns = 120
  const innerWidth = stdout.columns ?? fallbackColumns
  const { listWidth, quickWidth, previewWidth } = computeSettingsColumnWidths(innerWidth, Boolean(quickSettings))
  const selected = items[cursor]
  const previewContent = useMemo(() => resolvePreviewContent(selected, envOnly), [selected, envOnly])
  const previewContentLines = useMemo(
    () => countPreviewContentLines(previewContent, displayFormat),
    [previewContent, displayFormat],
  )
  const contentLines = Math.max(items.length, quickSettings?.items.length ?? 0, previewContentLines)
  const columnHeight = contentLines + BORDERED_TITLE_BOX_FRAME_LINES
  const modifiedPresetNames = new Set(quickSettings?.modifiedPresetNames ?? [])
  const activeQuickSetting = quickSettings?.items[quickSettings.cursor]

  return (
    <Box flexDirection="column">
      <TruncateText bold color="cyan">{title}</TruncateText>
      <TruncateText dimColor>{help}</TruncateText>
      {selected ? (
        <Text wrap="wrap">
          <Text dimColor>Current settings: </Text>
          {selected.name}{selected.temporary ? ' (detected)' : ''} · {selected.sourcePath}
        </Text>
      ) : null}
      {activeQuickSetting ? (
        <Text wrap="wrap">
          <Text dimColor>Quick setting: </Text>
          {activeQuickSetting.label}: <QuickSettingValue field={activeQuickSetting.field} value={activeQuickSetting.value} /> [{activeQuickSetting.source}]
          {activeQuickSetting.touched ? ' *' : ''}
        </Text>
      ) : null}
      <Box marginTop={0.5} width={innerWidth}>
        <BorderedTitleBox
          title={`Settings(${items.length})`}
          width={listWidth}
          height={columnHeight}
          borderColor={!quickSettings || quickSettings.focus === 'presets' ? 'cyan' : 'gray'}
        >
          {items.map((item, index) => (
            <TruncateText
              key={`${item.name}:${item.sourcePath}`}
              {...(index === cursor ? { color: 'cyan' as const } : {})}
            >
              {(!quickSettings || quickSettings.focus === 'presets') && index === cursor ? '❯ ' : '  '}
              {item.name}
              {item.temporary ? ' (detected)' : ''}
              {modifiedPresetNames.has(item.name) ? ' *' : ''}
            </TruncateText>
          ))}
        </BorderedTitleBox>
        <Box width={1} />
        {quickSettings && quickWidth ? (
          <>
            <BorderedTitleBox
              title="Quick Settings"
              width={quickWidth}
              height={columnHeight}
              borderColor={quickSettings.focus === 'quick-settings' ? 'cyan' : 'gray'}
            >
              {quickSettings.items.map((item, index) => (
                <TruncateText
                  key={item.field}
                  {...(index === quickSettings.cursor ? { color: 'cyan' as const } : {})}
                >
                  {quickSettings.focus === 'quick-settings' && index === quickSettings.cursor ? '❯ ' : '  '}
                  {item.label}: <QuickSettingValue field={item.field} value={item.value} /> [{item.source}]{item.touched ? ' *' : ''}
                </TruncateText>
              ))}
            </BorderedTitleBox>
            <Box width={1} />
          </>
        ) : null}
        <BorderedTitleBox
          title={selected ? 'Preview' : 'No settings selected'}
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
