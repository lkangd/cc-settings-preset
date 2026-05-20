import { Box, Text } from 'ink'

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

function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const indentColor = INDENT_COLOR[depth % INDENT_COLOR.length] as string

  if (Array.isArray(value)) {
    return (
      <Box flexDirection="column">
        <Text>
          {name && <Text color={KEY_COLOR}>{name}</Text>}
          {name && ': '}
          <Text color={BRACE_COLOR}>[</Text>
        </Text>
        {value.map((item, index) => (
          <Box key={index} paddingLeft={2}>
            <JsonNode value={item} depth={depth + 1} />
          </Box>
        ))}
        <Text color={BRACE_COLOR}>{'  '.repeat(depth)}]</Text>
      </Box>
    )
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return (
      <Box flexDirection="column">
        <Text>
          {name && <Text color={KEY_COLOR}>{name}</Text>}
          {name && ': '}
          <Text color={BRACE_COLOR}>{'{'}</Text>
        </Text>
        {entries.map(([key, child]) => (
          <Box key={key} paddingLeft={2}>
            <JsonNode name={key} value={child} depth={depth + 1} />
          </Box>
        ))}
        <Text color={BRACE_COLOR}>{'  '.repeat(depth)}{'}'}</Text>
      </Box>
    )
  }

  return (
    <Text>
      {name && <Text color={KEY_COLOR}>{name}</Text>}
      {name && ': '}
      <Text color={valueColor(value)}>{renderValue(value)}</Text>
    </Text>
  )
}

export function JsonTreeView({ value }: { value: unknown }) {
  return (
    <Box flexDirection="column">
      <JsonNode value={value} depth={0} />
    </Box>
  )
}
