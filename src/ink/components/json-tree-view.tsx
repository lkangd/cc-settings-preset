import { Box } from 'ink'
import { TruncateText } from './truncate-text.js'

function renderValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  return ''
}

function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  if (Array.isArray(value)) {
    return (
      <Box flexDirection="column" width="100%">
        <TruncateText>{name ? `${name}: [` : '['}</TruncateText>
        {value.map((item, index) => (
          <Box key={index} paddingLeft={2} width="100%">
            <JsonNode value={item} depth={depth + 1} />
          </Box>
        ))}
        <TruncateText>{`${'  '.repeat(depth)}]`}</TruncateText>
      </Box>
    )
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return (
      <Box flexDirection="column" width="100%">
        <TruncateText>{name ? `${name}: {` : '{'}</TruncateText>
        {entries.map(([key, child]) => (
          <Box key={key} paddingLeft={2} width="100%">
            <JsonNode name={key} value={child} depth={depth + 1} />
          </Box>
        ))}
        <TruncateText>{`${'  '.repeat(depth)}}`}</TruncateText>
      </Box>
    )
  }

  return (
    <TruncateText>
      {name ? `${name}: ${renderValue(value)}` : renderValue(value)}
    </TruncateText>
  )
}

export function JsonTreeView({ value }: { value: unknown }) {
  return (
    <Box flexDirection="column" width="100%">
      <JsonNode value={value} depth={0} />
    </Box>
  )
}
