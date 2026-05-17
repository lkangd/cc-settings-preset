import { useState } from 'react'
import { Box, Text, useApp, useInput } from 'ink'

import type { PresetMeta } from '../core/schema.js'
import { createRunFlowState, reduceRunFlow } from '../flows/run-flow.js'
import type { PluginState } from '../services/plugin-service.js'
import type { SkillState } from '../services/skill-service.js'
import { TextInput } from './components/text-input.js'
import { ThreeColumnView } from './components/three-column-view.js'

export type RunResult = {
  type: 'launch' | 'derive'
  preset: PresetMeta
  derivedName?: string
  plugins: PluginState[]
  skills: SkillState[]
}

type Props = {
  presets: PresetMeta[]
  plugins: PluginState[]
  skills: SkillState[]
  onSubmit: (result: RunResult) => void
}

export function RunApp({ presets, plugins, skills, onSubmit }: Props) {
  const { exit } = useApp()
  const [state, setState] = useState(() => createRunFlowState({ presets, plugins, skills }))
  const [namingDerived, setNamingDerived] = useState(false)
  const [derivedName, setDerivedName] = useState('')

  useInput((input, key) => {
    if (namingDerived) return

    if (key.escape) setState(current => reduceRunFlow(current, { type: 'escape' }))
    if (input === 'q') exit()
    if (input === 'p') setState(current => reduceRunFlow(current, { type: 'focus-plugins' }))
    if (input === 's') setState(current => reduceRunFlow(current, { type: 'focus-skills' }))
    if (key.upArrow || input === 'k') setState(current => reduceRunFlow(current, { type: 'up' }))
    if (key.downArrow || input === 'j') setState(current => reduceRunFlow(current, { type: 'down' }))
    if (input === ' ') setState(current => reduceRunFlow(current, { type: 'toggle-current' }))

    if (key.return) {
      const preset = state.presets[state.settingsCursor]
      if (!preset) return

      if (state.dirty) {
        setNamingDerived(true)
        return
      }

      onSubmit({ type: 'launch', preset, plugins: state.plugins, skills: state.skills })
      exit()
    }
  })

  if (namingDerived) {
    return (
      <TextInput
        label="Derived preset name"
        value={derivedName}
        placeholder="YYYY-MM-DD-HH-mm-ss"
        onChange={setDerivedName}
        onCancel={() => setNamingDerived(false)}
        onSubmit={() => {
          const preset = state.presets[state.settingsCursor]
          if (!preset) return
          onSubmit({ type: 'derive', preset, derivedName, plugins: state.plugins, skills: state.skills })
          exit()
        }}
      />
    )
  }

  return (
    <Box flexDirection="column">
      <ThreeColumnView
        title="Select Claude Code settings preset"
        help="↑/k ↓/j navigate · p plugins · s skills · space toggle · enter launch · q quit"
        presets={state.presets}
        plugins={state.plugins}
        skills={state.skills}
        focus={state.focus}
        settingsCursor={state.settingsCursor}
        pluginCursor={state.pluginCursor}
        skillCursor={state.skillCursor}
      />
      {state.dirty ? <Text color="yellow">Changes will create or reuse a derived preset.</Text> : null}
    </Box>
  )
}
