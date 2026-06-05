export const CCSP_COMMANDER_SUBCOMMANDS = ['create', 'manage', 'config'] as const

export const CCSP_PARSE_STOP_TOKENS = ['claude', ...CCSP_COMMANDER_SUBCOMMANDS] as const

export type CcspCommanderSubcommand = (typeof CCSP_COMMANDER_SUBCOMMANDS)[number]

const commanderSubcommandSet = new Set<string>(CCSP_COMMANDER_SUBCOMMANDS)
const parseStopTokenSet = new Set<string>(CCSP_PARSE_STOP_TOKENS)

export function isCcspCommanderSubcommand(value: string): value is CcspCommanderSubcommand {
  return commanderSubcommandSet.has(value)
}

export function isCcspParseStopToken(value: string): boolean {
  return parseStopTokenSet.has(value)
}
