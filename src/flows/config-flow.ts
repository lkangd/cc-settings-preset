import type { CcspConfig } from '../core/schema.js'

export type ConfigOptionKey = keyof CcspConfig

export type ConfigOption = {
  key: ConfigOptionKey
  label: string
  description: string
}

export const CONFIG_OPTIONS: ConfigOption[] = [
  {
    key: 'globalPresetEnvOnly',
    label: 'Global preset env-only',
    description:
      'When enabled, the global preset selection screen previews only the "env" field of the selected preset by default. Press f on that screen to toggle between the env-only view and the full settings view. When disabled, the full settings are shown by default.',
  },
  {
    key: 'statusLineEnabled',
    label: 'Show statusline',
    description:
      'When enabled, ccsp injects a statusline at the bottom of Claude Code showing the active preset and toggle summary. When disabled, the statusline is not injected and no statusline scripts are generated.',
  },
]

export type ConfigFlowState = {
  cursor: number
  config: CcspConfig
}

export type ConfigFlowEvent = { type: 'up' } | { type: 'down' } | { type: 'toggle' }

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(value, Math.max(0, length - 1)))
}

export function createConfigFlowState(config: CcspConfig): ConfigFlowState {
  return { cursor: 0, config }
}

export function reduceConfigFlow(state: ConfigFlowState, event: ConfigFlowEvent): ConfigFlowState {
  if (event.type === 'up') return { ...state, cursor: clamp(state.cursor - 1, CONFIG_OPTIONS.length) }
  if (event.type === 'down') return { ...state, cursor: clamp(state.cursor + 1, CONFIG_OPTIONS.length) }

  if (event.type === 'toggle') {
    const option = CONFIG_OPTIONS[state.cursor]
    if (!option) return state
    return {
      ...state,
      config: { ...state.config, [option.key]: !state.config[option.key] },
    }
  }

  return state
}
