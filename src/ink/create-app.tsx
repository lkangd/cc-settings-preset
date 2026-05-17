import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'

import { createCreateFlowState, type CreateSource } from '../flows/create-flow.js'
import { TextInput } from './components/text-input.js'

export type CreateResult = {
  sourcePath: string
  name: string
}

type Props = {
  sources: CreateSource[]
  onSubmit: (result: CreateResult) => void
}

export function CreateApp({ sources, onSubmit }: Props) {
  const { exit } = useApp()
  const [state, setState] = useState(() => createCreateFlowState(sources))

  useInput((input, key) => {
    if (state.mode !== 'select-source') return

    if (key.escape || input === 'q') {
      exit()
      return
    }

    if (key.upArrow || input === 'k') {
      setState(current => ({ ...current, cursor: Math.max(0, current.cursor - 1) }))
      return
    }

    if (key.downArrow || input === 'j') {
      setState(current => ({ ...current, cursor: Math.min(current.sources.length, current.cursor + 1) }))
      return
    }

    if (key.return) {
      const source = state.sources[state.cursor]
      if (source) {
        setState(current => ({ ...current, mode: 'name', selectedPath: source.filePath }))
        return
      }
      setState(current => ({ ...current, mode: 'manual-path' }))
    }
  })

  if (state.mode === 'manual-path') {
    return (
      <TextInput
        label="Settings JSON path"
        value={state.manualPath}
        placeholder="/path/to/settings.json"
        onChange={value => setState(current => ({ ...current, manualPath: value }))}
        onCancel={() => setState(current => ({ ...current, mode: 'select-source' }))}
        onSubmit={() => setState(current => ({ ...current, mode: 'name', selectedPath: current.manualPath }))}
      />
    )
  }

  if (state.mode === 'name') {
    return (
      <TextInput
        label="Preset name"
        value={state.name}
        placeholder="base"
        onChange={value => setState(current => ({ ...current, name: value }))}
        onCancel={() => setState(current => ({ ...current, mode: 'select-source' }))}
        onSubmit={() => {
          if (!state.selectedPath) return
          onSubmit({ sourcePath: state.selectedPath, name: state.name })
          exit()
        }}
      />
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Create first-level settings preset</Text>
      <Text dimColor>↑/k ↓/j navigate · enter select · q cancel</Text>
      <Box flexDirection="column" marginTop={1}>
        {state.sources.map((source, index) => (
          <Text key={source.filePath} {...(index === state.cursor ? { color: 'cyan' as const } : {})}>
            {index === state.cursor ? '❯ ' : '  '}{source.label} <Text dimColor>{source.filePath}</Text>
          </Text>
        ))}
        <Text {...(state.cursor === state.sources.length ? { color: 'cyan' as const } : {})}>
          {state.cursor === state.sources.length ? '❯ ' : '  '}Manual path
        </Text>
      </Box>
    </Box>
  )
}
