import { Box, Text } from 'ink'
import { isPlainObject } from '../../core/is-plain-object.js'
import { TruncateText } from './truncate-text.js'

const KEY_COLOR = 'cyan'
const BRACE_COLOR = 'gray'
const STRING_COLOR = 'green'
const NUMBER_COLOR = 'yellow'
const BOOL_COLOR = 'magenta'
const NULL_COLOR = 'gray'
const INDENT_COLOR: Array<string | undefined> = ['gray', 'blue', 'magenta', 'cyan', 'yellow', 'green', 'red']

function valueColor(value: unknown): string {
  if (typeof value === 'string') return STRING_COLOR
  if (typeof value === 'number') return NUMBER_COLOR
  if (typeof value === 'boolean') return BOOL_COLOR
  return NULL_COLOR
}

function renderValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  return ''
}

function indentColor(depth: number): string {
  return INDENT_COLOR[depth % INDENT_COLOR.length] ?? BRACE_COLOR
}

function JsonOpen({ name, open }: { name?: string; open: '[' | '{' }) {
  return (
    <TruncateText>
      {name ? (
        <>
          <Text color={KEY_COLOR}>{name}</Text>
          <Text color={BRACE_COLOR}>: {open}</Text>
        </>
      ) : (
        <Text color={BRACE_COLOR}>{open}</Text>
      )}
    </TruncateText>
  )
}

function JsonClose({ depth, close }: { depth: number; close: ']' | '}' }) {
  return (
    <TruncateText>
      <Text color={indentColor(depth)}>{'  '.repeat(depth)}</Text>
      <Text color={BRACE_COLOR}>{close}</Text>
    </TruncateText>
  )
}

function JsonLeaf({ name, value }: { name?: string; value: unknown }) {
  return (
    <TruncateText>
      {name ? (
        <>
          <Text color={KEY_COLOR}>{name}</Text>
          <Text color={BRACE_COLOR}>: </Text>
          <Text color={valueColor(value)}>{renderValue(value)}</Text>
        </>
      ) : (
        <Text color={valueColor(value)}>{renderValue(value)}</Text>
      )}
    </TruncateText>
  )
}

export function countJsonTreeViewLines(value: unknown): number {
  if (Array.isArray(value)) return 2 + value.reduce<number>((sum, item) => sum + countJsonTreeViewLines(item), 0)
  if (isPlainObject(value)) return 2 + Object.values(value).reduce<number>((sum, item) => sum + countJsonTreeViewLines(item), 0)
  return 1
}

function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  if (Array.isArray(value)) {
    return (
      <Box flexDirection="column" width="100%">
        <JsonOpen {...(name !== undefined ? { name } : {})} open="[" />
        {value.map((item, index) => (
          <Box key={index} paddingLeft={2} width="100%">
            <JsonNode value={item} depth={depth + 1} />
          </Box>
        ))}
        <JsonClose depth={depth} close="]" />
      </Box>
    )
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
    return (
      <Box flexDirection="column" width="100%">
        <JsonOpen {...(name !== undefined ? { name } : {})} open="{" />
        {entries.map(([key, child]) => (
          <Box key={key} paddingLeft={2} width="100%">
            <JsonNode name={key} value={child} depth={depth + 1} />
          </Box>
        ))}
        <JsonClose depth={depth} close="}" />
      </Box>
    )
  }

  return <JsonLeaf {...(name !== undefined ? { name } : {})} value={value} />
}

export function JsonTreeView({ value }: { value: unknown }) {
  return (
    <Box flexDirection="column" width="100%">
      <JsonNode value={value} depth={0} />
    </Box>
  )
}
