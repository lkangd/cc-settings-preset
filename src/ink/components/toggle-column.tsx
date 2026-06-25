import { Text } from 'ink'
import type { ToggleColumnItem } from '../../flows/project-launch-flow.js'
import { BorderedTitleBox } from './bordered-title-box.js'
import { TruncateText } from './truncate-text.js'

export function countToggleColumnContentLines(items: ToggleColumnItem[]): number {
  return Math.max(items.length, 1)
}

function sourceBadge(source: ToggleColumnItem['source']): string {
  if (source === 'project-local') return '[L]'
  if (source === 'project') return '[P]'
  if (source === 'user') return '[U]'
  if (source === 'command') return '[C]'
  if (source === 'plugin') return '[PL]'
  if (source === 'local') return '[L]'
  if (source === 'connector') return '[CN]'
  return '[D]'
}

export function ToggleColumn({
  title,
  focused,
  items,
  cursor,
  width,
  height,
}: {
  title: string
  focused: boolean
  items: ToggleColumnItem[]
  cursor: number
  width: number
  height?: number
}) {
  const Line = TruncateText

  return (
    <BorderedTitleBox
      title={title}
      width={width}
      borderColor={focused ? 'cyan' : 'gray'}
      {...(height === undefined ? {} : { height })}
    >
      {items.map((item, index) => {
        const lockedOff = Boolean(item.enableLocked && !item.enabled)
        const focusedLine = focused && index === cursor
        const dimProps = lockedOff ? { dimColor: true as const } : {}
        return (
          <Line
            key={item.name}
            {...dimProps}
            {...(focusedLine ? { color: 'cyan' as const } : {})}
          >
            {focusedLine ? '❯ ' : '  '}
            <Text {...dimProps} color={item.enabled ? 'green' : 'red'}>{item.enabled ? 'ON ' : 'OFF'}</Text>{' '}
            <Text {...dimProps}>{sourceBadge(item.source)}</Text>{' '}
            <Text {...dimProps}>{item.name}</Text>
            {item.toggleable === false ? <Text {...dimProps}> (plugin)</Text> : null}
          </Line>
        )
      })}
      {items.length === 0 ? <Line dimColor>none found</Line> : null}
    </BorderedTitleBox>
  )
}
