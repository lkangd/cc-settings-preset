import { Box, useStdout } from 'ink'
import type { ProjectLaunchFocus, ProjectLaunchPresetItem, ToggleColumnItem } from '../../flows/project-launch-flow.js'
import { enabledToggleCount } from '../../flows/toggle-utils.js'
import { BORDERED_TITLE_BOX_FRAME_LINES, BorderedTitleBox } from './bordered-title-box.js'
import { countToggleColumnContentLines, ToggleColumn } from './toggle-column.js'
import { useInkResizeVersion } from './resize-context.js'
import { TruncateText } from './truncate-text.js'

export type ProjectLaunchColumnsViewProps = {
  presetItems: ProjectLaunchPresetItem[]
  presetCursor: number
  focus: ProjectLaunchFocus
  plugins: Array<{ enabled: boolean }>
  pluginItems: ToggleColumnItem[]
  pluginCursor: number
  skills: Array<{ enabled: boolean }>
  skillItems: ToggleColumnItem[]
  skillCursor: number
  mcps: Array<{ enabled: boolean }>
  mcpItems: ToggleColumnItem[]
  mcpCursor: number
  title?: string
  help?: string
  toggleMessage?: string
  minWidth?: number
}

export function computeProjectLaunchColumnWidths(innerWidth: number): {
  presetWidth: number
  detailWidth: number
  mcpWidth: number
} {
  const gapWidth = 3
  const contentWidth = innerWidth - gapWidth
  const presetWidth = Math.max(22, Math.floor(contentWidth * 0.22))
  const detailWidth = Math.max(24, Math.floor((contentWidth - presetWidth) / 3))
  const mcpWidth = contentWidth - presetWidth - detailWidth - detailWidth
  return { presetWidth, detailWidth, mcpWidth }
}

export function ProjectLaunchColumnsView({
  presetItems,
  presetCursor,
  focus,
  plugins,
  pluginItems,
  pluginCursor,
  skills,
  skillItems,
  skillCursor,
  mcps,
  mcpItems,
  mcpCursor,
  title = 'Select project launch preset',
  help = '←/→ switch column · h/j/k/l navigate · t sort · space toggle · enter launch · esc presets/back · q quit',
  toggleMessage,
  minWidth,
}: ProjectLaunchColumnsViewProps) {
  useInkResizeVersion()
  const { stdout } = useStdout()
  const innerWidth = Math.max(minWidth ?? 0, stdout.columns ?? 120)
  const { presetWidth, detailWidth, mcpWidth } = computeProjectLaunchColumnWidths(innerWidth)
  const columnContentHeight = Math.max(
    presetItems.length,
    countToggleColumnContentLines(pluginItems),
    countToggleColumnContentLines(skillItems),
    countToggleColumnContentLines(mcpItems),
  )
  const columnHeight = columnContentHeight + BORDERED_TITLE_BOX_FRAME_LINES

  return (
    <Box flexDirection="column">
      <TruncateText bold color="cyan">{title}</TruncateText>
      <TruncateText dimColor>{help}</TruncateText>
      <Box marginTop={0.5} width={innerWidth} flexDirection="row">
        <BorderedTitleBox
          title={`Presets(${presetItems.length})`}
          width={presetWidth}
          height={columnHeight}
          borderColor={focus === 'presets' ? 'cyan' : 'gray'}
        >
          {presetItems.map((item, index) => (
            <TruncateText
              key={item.name}
              {...(index === presetCursor ? { color: 'cyan' as const } : {})}
            >
              {focus === 'presets' && index === presetCursor ? '❯ ' : '  '}
              {item.name}
            </TruncateText>
          ))}
        </BorderedTitleBox>
        <Box width={1} />
        <ToggleColumn
          title={`Plugins(${enabledToggleCount(plugins)}/${plugins.length})`}
          focused={focus === 'plugins'}
          items={pluginItems}
          cursor={pluginCursor}
          width={detailWidth}
          height={columnHeight}
        />
        <Box width={1} />
        <ToggleColumn
          title={`Skills(${enabledToggleCount(skills)}/${skills.length})`}
          focused={focus === 'skills'}
          items={skillItems}
          cursor={skillCursor}
          width={detailWidth}
          height={columnHeight}
        />
        <Box width={1} />
        <ToggleColumn
          title={`MCPs(${enabledToggleCount(mcps)}/${mcps.length})`}
          focused={focus === 'mcps'}
          items={mcpItems}
          cursor={mcpCursor}
          width={mcpWidth}
          height={columnHeight}
        />
      </Box>
      {toggleMessage ? <TruncateText color="yellow">{toggleMessage}</TruncateText> : null}
    </Box>
  )
}
