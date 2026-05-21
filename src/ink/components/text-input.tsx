import { Box, useInput } from 'ink'

import { TruncateText } from './truncate-text.js'
import { useTextInput } from './use-text-input.js'
import { useTextInputState } from './use-text-input-state.js'

type Props = {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onSubmit: () => void | Promise<void>
  onCancel: () => void
}

export function TextInput({ label, value, placeholder, onChange, onSubmit, onCancel }: Props) {
  const state = useTextInputState({
    defaultValue: value,
    onChange,
    onSubmit: () => {
      void onSubmit()
    },
  })

  const inputValue = useTextInput({ state, placeholder: placeholder ?? '' })

  useInput((_input, key) => {
    if (key.escape) {
      onCancel()
    }
  })

  return (
    <Box flexDirection="column">
      <TruncateText bold>{label}</TruncateText>
      <TruncateText dimColor={!state.value}>{inputValue}</TruncateText>
      <TruncateText dimColor>
        enter confirm · esc cancel · ←/→ cursor · ⌃U del to start · ⌃K del to end
      </TruncateText>
    </Box>
  )
}
