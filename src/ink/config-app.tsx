import { useState } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import {
  CONFIG_OPTIONS,
  createConfigFlowState,
  reduceConfigFlow,
} from '../flows/config-flow.js'
import type { CcspConfig } from '../core/schema.js'
import { BorderedTitleBox } from './components/bordered-title-box.js'
import { useInkResizeVersion } from './components/resize-context.js'
import { TruncateText } from './components/truncate-text.js'

const VALUE_COLORS = {
  on: 'green',
  off: 'gray',
  info: 'cyan',
} as const

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
        <Box marginRight={0.5}>
          <BorderedTitleBox title={`Config(${CONFIG_OPTIONS.length})`} width={listWidth} borderColor="cyan">
            {CONFIG_OPTIONS.map((option, index) => {
              const display = option.display(state.config)
              const isCursor = index === state.cursor
              return (
                <TruncateText key={option.key} {...(isCursor ? { color: 'cyan' as const } : {})}>
                  {isCursor ? '❯ ' : '  '}
                  {option.label}
                  {' '}
                  <Text color={VALUE_COLORS[display.tone]}>[{display.label}]</Text>
                </TruncateText>
              )
            })}
          </BorderedTitleBox>
        </Box>
        <BorderedTitleBox
          title={focused?.label ?? 'No option selected'}
          width={previewWidth}
          borderColor="gray"
        >
          {focused ? <Text>{focused.description}</Text> : <TruncateText dimColor>no description</TruncateText>}
        </BorderedTitleBox>
      </Box>
    </Box>
  )
}
