import { Text } from 'ink'
import type { ToggleColumnItem } from '../../flows/project-launch-flow.js'
import { BorderedTitleBox } from './bordered-title-box.js'
import { TruncateText } from './truncate-text.js'

export function countToggleColumnContentLines(items: ToggleColumnItem[]): number {
  return Math.max(items.length, 1)
}

export const SOURCE_BADGE_ITEMS: Array<{
  sources: ToggleColumnItem['source'][]
  badge: string
  label: string
}> = [
  { sources: ['local', 'project-local'], badge: '[L]', label: '[L] local/project-local' },
  { sources: ['project'], badge: '[P]', label: '[P] project' },
  { sources: ['user'], badge: '[U]', label: '[U] user' },
  { sources: ['command'], badge: '[C]', label: '[C] command' },
  { sources: ['plugin'], badge: '[PL]', label: '[PL] plugin' },
  { sources: ['connector'], badge: '[CN]', label: '[CN] connector' },
  { sources: ['preset'], badge: '[D]', label: '[D] default/discovered' },
  // Its own badge rather than sharing the dimmed look of a settings-locked row:
  // "not installed here" and "installed but switched off elsewhere" call for
  // completely different fixes.
  { sources: ['missing'], badge: '[!]', label: '[!] not installed' },
]

function sourceBadge(source: ToggleColumnItem['source']): string {
  return SOURCE_BADGE_ITEMS.find(item => item.sources.includes(source))?.badge ?? '[D]'
}

export function isMissingToggleItem(item: Pick<ToggleColumnItem, 'source'>): boolean {
  return item.source === 'missing'
}

export function ToggleItemText({ item }: { item: ToggleColumnItem }) {
  const missing = isMissingToggleItem(item)
  const dimProps = missing || (item.enableLocked && !item.enabled) ? { dimColor: true as const } : {}

  return (
    <>
      <Text {...dimProps} color={item.enabled ? 'green' : 'red'}>{item.enabled ? 'ON ' : 'OFF'}</Text>{' '}
      <Text {...dimProps}>{sourceBadge(item.source)}</Text>{' '}
      <Text {...dimProps}>{item.name}</Text>
      {missing
        ? <Text {...dimProps}> (not installed)</Text>
        : item.toggleable === false ? <Text {...dimProps}> (plugin)</Text> : null}
    </>
  )
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
        const lockedOff = Boolean(item.enableLocked && !item.enabled) || isMissingToggleItem(item)
        const focusedLine = focused && index === cursor
        const dimProps = lockedOff ? { dimColor: true as const } : {}
        return (
          <Line
            key={item.name}
            {...dimProps}
            {...(focusedLine ? { color: 'cyan' as const } : {})}
          >
            {focusedLine ? '❯ ' : '  '}
            <ToggleItemText item={item} />
          </Line>
        )
      })}
      {items.length === 0 ? <Line dimColor>none found</Line> : null}
    </BorderedTitleBox>
  )
}
