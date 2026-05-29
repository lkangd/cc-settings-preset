import { useState } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import {
  CONFIG_OPTIONS,
  createConfigFlowState,
  reduceConfigFlow,
} from '../flows/config-flow.js'
import type { CcspConfig } from '../core/schema.js'
import { useInkResizeVersion } from './components/resize-context.js'
import { TruncateText } from './components/truncate-text.js'

type Props = {
  initialConfig: CcspConfig
  onChange: (config: CcspConfig) => void
}

export function ConfigApp({ initialConfig, onChange }: Props) {
  const { exit } = useApp()
  useInkResizeVersion()
  const { stdout } = useStdout()
  const [state, setState] = useState(() => createConfigFlowState(initialConfig))

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit()
      return
    }

    if (key.upArrow || input === 'k') setState(current => reduceConfigFlow(current, { type: 'up' }))
    if (key.downArrow || input === 'j') setState(current => reduceConfigFlow(current, { type: 'down' }))

    if (input === ' ' || key.return) {
      const next = reduceConfigFlow(state, { type: 'toggle' })
      setState(next)
      onChange(next.config)
    }
  })

  const fallbackColumns = 120
  const innerWidth = stdout.columns ?? fallbackColumns
  const listWidth = Math.max(20, Math.floor((innerWidth - 1) / 2))
  const previewWidth = Math.max(20, innerWidth - listWidth - 1)
  const focused = CONFIG_OPTIONS[state.cursor]

  return (
    <Box flexDirection="column">
      <TruncateText bold color="cyan">ccsp config</TruncateText>
      <TruncateText dimColor>↑/k ↓/j navigate · space/enter toggle · q quit</TruncateText>
      <Box marginTop={0.5} width={innerWidth}>
        <Box
          flexDirection="column"
          width={listWidth}
          marginRight={0.5}
          borderStyle="round"
          borderColor="cyan"
          paddingX={0.5}
          paddingY={0.5}
        >
          <TruncateText bold>Config({CONFIG_OPTIONS.length})</TruncateText>
          {CONFIG_OPTIONS.map((option, index) => {
            const enabled = state.config[option.key]
            const isCursor = index === state.cursor
            return (
              <TruncateText key={option.key} {...(isCursor ? { color: 'cyan' as const } : {})}>
                {isCursor ? '❯ ' : '  '}
                {option.label}
                {' '}
                <Text color={enabled ? 'green' : 'gray'}>[{enabled ? 'enable' : 'disabled'}]</Text>
              </TruncateText>
            )
          })}
        </Box>
        <Box
          flexDirection="column"
          width={previewWidth}
          borderStyle="round"
          borderColor="gray"
          paddingX={0.5}
          paddingY={0.5}
        >
          <TruncateText bold>{focused?.label ?? 'No option selected'}</TruncateText>
          {focused ? <Text>{focused.description}</Text> : <TruncateText dimColor>no description</TruncateText>}
        </Box>
      </Box>
    </Box>
  )
}
