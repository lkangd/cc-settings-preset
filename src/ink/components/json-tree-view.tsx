import { Box, Text } from 'ink'

function renderValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  return ''
}

function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const prefix = '  '.repeat(depth)
  const label = name ? `${prefix}${name}: ` : prefix

  if (Array.isArray(value)) {
    return (
      <Box flexDirection="column">
        <Text>{label}[</Text>
        {value.map((item, index) => <JsonNode key={index} value={item} depth={depth + 1} />)}
        <Text>{prefix}]</Text>
      </Box>
    )
  }

  if (value && typeof value === 'object') {
    return (
      <Box flexDirection="column">
        <Text>{label}{'{'}</Text>
        {Object.entries(value as Record<string, unknown>).map(([key, child]) => (
          <JsonNode key={key} name={key} value={child} depth={depth + 1} />
        ))}
        <Text>{prefix}{'}'}</Text>
      </Box>
    )
  }

  return <Text>{label}{renderValue(value)}</Text>
}

export function JsonTreeView({ value }: { value: unknown }) {
  return (
    <Box flexDirection="column">
      <JsonNode value={value} depth={0} />
    </Box>
  )
}
