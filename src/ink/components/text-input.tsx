import { Box, Text, useInput } from 'ink'
import { TruncateText } from './truncate-text.js'

type Props = {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  onCancel: () => void
}

export function TextInput({ label, value, placeholder, onChange, onSubmit, onCancel }: Props) {
  useInput((input, key) => {
    if (key.return) {
      onSubmit()
      return
    }

    if (key.escape) {
      onCancel()
      return
    }

    if (key.backspace || key.delete) {
      onChange(value.slice(0, -1))
      return
    }

    if (input && !key.ctrl && !key.meta) {
      onChange(value + input)
    }
  })

  return (
    <Box flexDirection="column">
      <TruncateText bold>{label}</TruncateText>
      <TruncateText dimColor={!value}>{value || placeholder || ''}<Text color="cyan">▌</Text></TruncateText>
      <TruncateText dimColor>enter confirm · esc cancel</TruncateText>
    </Box>
  )
}
