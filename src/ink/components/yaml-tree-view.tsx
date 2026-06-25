import { Box, Text } from 'ink'
import { isPlainObject } from '../../core/is-plain-object.js'
import { TruncateText } from './truncate-text.js'

const KEY_COLOR = 'cyan'
const PUNCT_COLOR = 'gray'
const STRING_COLOR = 'green'
const NUMBER_COLOR = 'yellow'
const BOOL_COLOR = 'magenta'
const NULL_COLOR = 'gray'

function isScalar(value: unknown): boolean {
  return !isPlainObject(value) && !Array.isArray(value)
}

function scalarColor(value: unknown): string {
  if (typeof value === 'string') return STRING_COLOR
  if (typeof value === 'number') return NUMBER_COLOR
  if (typeof value === 'boolean') return BOOL_COLOR
  return NULL_COLOR
}

function needsQuote(value: string): boolean {
  if (value === '') return true
  if (/^\s|\s$/.test(value)) return true
  if (/: |:$| #/.test(value)) return true
  if (/^[#&*!|>%@`"'[\]{},?:-]/.test(value)) return true
  if (/[\n\t]/.test(value)) return true
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(value)) return true
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) return true
  return false
}

function renderScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return needsQuote(value) ? JSON.stringify(value) : value
  return String(value)
}

function countYamlMappingEntryLines(value: unknown): number {
  if (Array.isArray(value)) return value.length === 0 ? 1 : 1 + countYamlSequenceLines(value)
  if (isPlainObject(value)) return Object.keys(value).length === 0 ? 1 : 1 + countYamlMappingLines(value)
  return 1
}

function countYamlMappingLines(value: Record<string, unknown>): number {
  const entries = Object.values(value)
  if (entries.length === 0) return 1
  return entries.reduce<number>((sum, item) => sum + countYamlMappingEntryLines(item), 0)
}

function countYamlSequenceItemLines(value: unknown): number {
  if (Array.isArray(value)) return value.length === 0 ? 1 : countYamlSequenceLines(value)
  if (isPlainObject(value)) return Object.keys(value).length === 0 ? 1 : countYamlMappingLines(value)
  return 1
}

function countYamlSequenceLines(items: unknown[]): number {
  if (items.length === 0) return 1
  return items.reduce<number>((sum, item) => sum + countYamlSequenceItemLines(item), 0)
}

export function countYamlTreeViewLines(value: unknown): number {
  if (Array.isArray(value)) return countYamlSequenceLines(value)
  if (isPlainObject(value)) return countYamlMappingLines(value)
  return 1
}

function YamlScalar({ value }: { value: unknown }) {
  return <Text color={scalarColor(value)}>{renderScalar(value)}</Text>
}

function YamlMapping({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value)
  if (entries.length === 0) return <TruncateText><Text color={PUNCT_COLOR}>{'{}'}</Text></TruncateText>

  return (
    <Box flexDirection="column" width="100%">
      {entries.map(([key, child]) => (
        <YamlEntry key={key} name={key} value={child} />
      ))}
    </Box>
  )
}

function YamlEntry({ name, value }: { name: string; value: unknown }) {
  const keyLabel = <Text color={KEY_COLOR}>{name}</Text>

  if (isScalar(value)) {
    return (
      <TruncateText>
        {keyLabel}
        <Text color={PUNCT_COLOR}>: </Text>
        <YamlScalar value={value} />
      </TruncateText>
    )
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <TruncateText>
          {keyLabel}
          <Text color={PUNCT_COLOR}>: []</Text>
        </TruncateText>
      )
    }
    return (
      <Box flexDirection="column" width="100%">
        <TruncateText>
          {keyLabel}
          <Text color={PUNCT_COLOR}>:</Text>
        </TruncateText>
        <Box paddingLeft={2} width="100%">
          <YamlSequence items={value} />
        </Box>
      </Box>
    )
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) {
    return (
      <TruncateText>
        {keyLabel}
        <Text color={PUNCT_COLOR}>{': {}'}</Text>
      </TruncateText>
    )
  }
  return (
    <Box flexDirection="column" width="100%">
      <TruncateText>
        {keyLabel}
        <Text color={PUNCT_COLOR}>:</Text>
      </TruncateText>
      <Box paddingLeft={2} width="100%">
        <YamlMapping value={value as Record<string, unknown>} />
      </Box>
    </Box>
  )
}

function YamlSequence({ items }: { items: unknown[] }) {
  return (
    <Box flexDirection="column" width="100%">
      {items.map((item, index) => (
        <YamlSequenceItem key={index} value={item} />
      ))}
    </Box>
  )
}

function YamlSequenceItem({ value }: { value: unknown }) {
  const dash = <Text color={PUNCT_COLOR}>- </Text>

  if (isScalar(value)) {
    return (
      <TruncateText>
        {dash}
        <YamlScalar value={value} />
      </TruncateText>
    )
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <TruncateText>
          {dash}
          <Text color={PUNCT_COLOR}>[]</Text>
        </TruncateText>
      )
    }
    return (
      <Box flexDirection="row" width="100%">
        {dash}
        <Box flexDirection="column" width="100%">
          <YamlSequence items={value} />
        </Box>
      </Box>
    )
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) {
    return (
      <TruncateText>
        {dash}
        <Text color={PUNCT_COLOR}>{'{}'}</Text>
      </TruncateText>
    )
  }
  return (
    <Box flexDirection="row" width="100%">
      {dash}
      <Box flexDirection="column" width="100%">
        <YamlMapping value={value as Record<string, unknown>} />
      </Box>
    </Box>
  )
}

export function YamlTreeView({ value }: { value: unknown }) {
  let content
  if (Array.isArray(value)) {
    content = value.length === 0 ? <TruncateText><Text color={PUNCT_COLOR}>[]</Text></TruncateText> : <YamlSequence items={value} />
  } else if (isPlainObject(value)) {
    content = <YamlMapping value={value} />
  } else {
    content = <TruncateText><YamlScalar value={value} /></TruncateText>
  }

  return (
    <Box flexDirection="column" width="100%">
      {content}
    </Box>
  )
}
