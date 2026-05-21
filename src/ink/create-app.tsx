import { useState } from 'react'
import { Box, useApp, useInput } from 'ink'

import { normalizeInputPath } from '../core/paths.js'
import { derivePresetNameFromSettingsPath } from '../core/name.js'
import { createCreateFlowState, transitionCreateFlowToName, type CreateSource } from '../flows/create-flow.js'
import { TextInput } from './components/text-input.js'
import { TruncateText } from './components/truncate-text.js'

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
        setState(current => transitionCreateFlowToName(current, source.filePath))
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
        onSubmit={() => setState(current => transitionCreateFlowToName(
          current,
          normalizeInputPath(current.manualPath),
        ))}
      />
    )
  }

  if (state.mode === 'name' && state.selectedPath) {
    const defaultName = derivePresetNameFromSettingsPath(state.selectedPath)
    const resolvedName = state.name.trim() || defaultName
    return (
      <TextInput
        label="Preset name"
        value={state.name}
        placeholder={defaultName}
        onChange={value => setState(current => ({ ...current, name: value }))}
        onCancel={() => setState(current => ({ ...current, mode: 'select-source' }))}
        onSubmit={() => {
          onSubmit({ sourcePath: state.selectedPath!, name: resolvedName })
          exit()
        }}
      />
    )
  }

  return (
    <Box flexDirection="column">
      <TruncateText bold color="cyan">Create first-level settings preset</TruncateText>
      <TruncateText dimColor>↑/k ↓/j navigate · enter select · q cancel</TruncateText>
      <Box flexDirection="column" marginTop={1}>
        {state.sources.map((source, index) => (
          <TruncateText key={source.filePath} {...(index === state.cursor ? { color: 'cyan' as const } : {})}>
            {index === state.cursor ? '❯ ' : '  '}{source.label} {source.filePath}
          </TruncateText>
        ))}
        <TruncateText {...(state.cursor === state.sources.length ? { color: 'cyan' as const } : {})}>
          {state.cursor === state.sources.length ? '❯ ' : '  '}Manual path
        </TruncateText>
      </Box>
    </Box>
  )
}
