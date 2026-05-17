import { Box, Text, useInput } from 'ink'

type Props = {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onSubmit: () => void
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
      <Text bold>{label}</Text>
      <Text>
        {value || <Text dimColor>{placeholder ?? ''}</Text>}
        <Text color="cyan">▌</Text>
      </Text>
      <Text dimColor>enter confirm · esc cancel</Text>
    </Box>
  )
}
