import { useState } from 'react'
import { Box, Text, useInput } from 'ink'

export type PresetConflictChoice = 'overwrite' | 'rename' | 'cancel'

const CHOICES: Array<{ value: PresetConflictChoice; label: string; hint: string }> = [
  { value: 'overwrite', label: 'Overwrite', hint: 'replace the existing one with this' },
  { value: 'rename', label: 'Rename', hint: 'keep both, under a different name' },
  { value: 'cancel', label: 'Cancel', hint: 'leave everything as it is' },
]

// Rename, not overwrite. Overwriting is the one choice here that destroys
// something the user already tuned, so it has to be reached deliberately rather
// than by pressing enter on whatever happened to be highlighted.
const DEFAULT_CHOICE_INDEX = CHOICES.findIndex(choice => choice.value === 'rename')

export function PresetConflictPrompt({
  title,
  existingName,
  onChoose,
}: {
  title: string
  existingName: string
  onChoose: (choice: PresetConflictChoice) => void
}) {
  const [cursor, setCursor] = useState(DEFAULT_CHOICE_INDEX)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setCursor(current => Math.max(0, current - 1))
      return
    }
    if (key.downArrow || input === 'j') {
      setCursor(current => Math.min(CHOICES.length - 1, current + 1))
      return
    }
    if (key.escape) {
      onChoose('cancel')
      return
    }
    if (key.return) {
      onChoose(CHOICES[cursor]?.value ?? 'cancel')
    }
  })

  return (
    <Box flexDirection="column">
      <Text color="yellow">{title}</Text>
      <Text dimColor>{`"${existingName}" already exists.`}</Text>
      {CHOICES.map((choice, index) => (
        <Text key={choice.value} {...(index === cursor ? { color: 'cyan' as const } : {})}>
          {index === cursor ? '❯ ' : '  '}
          {choice.label}
          <Text dimColor>{` — ${choice.hint}`}</Text>
        </Text>
      ))}
      <Text dimColor>j/k move · enter confirm · esc cancel</Text>
    </Box>
  )
}
