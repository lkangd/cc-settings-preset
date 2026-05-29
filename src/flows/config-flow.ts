import type { CcspConfig } from '../core/schema.js'

export type ConfigOptionKey = keyof CcspConfig

export type ConfigValueDisplay = {
  label: string
  tone: 'on' | 'off' | 'info'
}

export type ConfigOption = {
  key: ConfigOptionKey
  label: string
  description: string
  display: (config: CcspConfig) => ConfigValueDisplay
  toggle: (config: CcspConfig) => CcspConfig
}

function booleanDisplay(value: boolean): ConfigValueDisplay {
  return value ? { label: 'enable', tone: 'on' } : { label: 'disabled', tone: 'off' }
}

export const CONFIG_OPTIONS: ConfigOption[] = [
  {
    key: 'globalPresetEnvOnly',
    label: 'Global preset env-only',
    description:
      'When enabled, the global preset selection screen previews only the "env" field of the selected preset by default. Press f on that screen to toggle between the env-only view and the full settings view. When disabled, the full settings are shown by default.',
    display: config => booleanDisplay(config.globalPresetEnvOnly),
    toggle: config => ({ ...config, globalPresetEnvOnly: !config.globalPresetEnvOnly }),
  },
  {
    key: 'statusLineEnabled',
    label: 'Show statusline',
    description:
      'When enabled, ccsp injects a statusline at the bottom of Claude Code showing the active preset and toggle summary. When disabled, the statusline is not injected and no statusline scripts are generated.',
    display: config => booleanDisplay(config.statusLineEnabled),
    toggle: config => ({ ...config, statusLineEnabled: !config.statusLineEnabled }),
  },
  {
    key: 'settingsDisplayFormat',
    label: 'Settings preview format',
    description:
      'How the selected preset settings are rendered on the right of the preset selection (ccsp) and manage (ccsp manage) screens: yaml or json. Both are syntax-highlighted. Press space/enter to switch.',
    display: config => ({ label: config.settingsDisplayFormat, tone: 'info' }),
    toggle: config => ({
      ...config,
      settingsDisplayFormat: config.settingsDisplayFormat === 'yaml' ? 'json' : 'yaml',
    }),
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
    return { ...state, config: option.toggle(state.config) }
  }

  return state
}
