import { useRef, useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'

import { normalizeInputPath } from '../core/paths.js'
import { derivePresetNameFromSettingsPath } from '../core/name.js'
import { createCreateFlowState, transitionCreateFlowToName, type CreateSource } from '../flows/create-flow.js'
import { TextInput } from './components/text-input.js'
import { TruncateText } from './components/truncate-text.js'

export type CreateResult = {
  sourcePath: string
  name: string
}

export type CreateSubmitResult =
  | { ok: true }
  | { ok: false; error: string }

type Props = {
  sources: CreateSource[]
  onSubmit: (result: CreateResult) => Promise<CreateSubmitResult> | CreateSubmitResult
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function CreateApp({ sources, onSubmit }: Props) {
  const { exit } = useApp()
  const [state, setState] = useState(() => createCreateFlowState(sources))
  const [nameError, setNameError] = useState<string | null>(null)
  const [manualPathError, setManualPathError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitVersion = useRef(0)
  const isSubmittingRef = useRef(false)

  const resetSubmitting = () => {
    isSubmittingRef.current = false
    setIsSubmitting(false)
  }

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
      <Box flexDirection="column">
        <TextInput
          label="Settings JSON path"
          value={state.manualPath}
          placeholder="/path/to/settings.json"
          onChange={value => {
            if (manualPathError) setManualPathError(null)
            setState(current => ({ ...current, manualPath: value }))
          }}
          onCancel={() => {
            setManualPathError(null)
            setState(current => ({ ...current, mode: 'select-source' }))
          }}
          onSubmit={() => {
            if (!state.manualPath.trim()) {
              setManualPathError('Settings JSON path is required')
              return
            }

            setManualPathError(null)
            setState(current => transitionCreateFlowToName(
              current,
              normalizeInputPath(current.manualPath),
            ))
          }}
        />
        {manualPathError ? <Text color="red">{manualPathError}</Text> : null}
      </Box>
    )
  }

  if (state.mode === 'name' && state.selectedPath) {
    const selectedPath = state.selectedPath
    const defaultName = derivePresetNameFromSettingsPath(selectedPath)
    const resolvedName = state.name.trim() || defaultName
    return (
      <Box flexDirection="column">
        {nameError ? <Text color="red">{nameError}</Text> : null}
        <TextInput
          label="Preset name"
          value={state.name}
          placeholder={defaultName}
          isDisabled={isSubmitting}
          onChange={value => {
            if (nameError) setNameError(null)
            setState(current => ({ ...current, name: value }))
          }}
          onCancel={() => {
            submitVersion.current += 1
            resetSubmitting()
            setNameError(null)
            setState(current => ({ ...current, mode: 'select-source' }))
          }}
          onSubmit={async () => {
            if (isSubmittingRef.current) return

            const currentSubmitVersion = submitVersion.current + 1
            submitVersion.current = currentSubmitVersion
            isSubmittingRef.current = true
            setIsSubmitting(true)
            setNameError(null)

            try {
              const result = await onSubmit({ sourcePath: selectedPath, name: resolvedName })
              if (submitVersion.current !== currentSubmitVersion) return
              if (!result.ok) {
                resetSubmitting()
                setNameError(result.error)
                return
              }
              exit()
            } catch (error) {
              if (submitVersion.current !== currentSubmitVersion) return
              resetSubmitting()
              setNameError(getErrorMessage(error))
            }
          }}
        />
      </Box>
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
