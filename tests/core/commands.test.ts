import { describe, expect, it } from 'vitest'
import { CCSP_COMMANDER_SUBCOMMANDS, CCSP_PARSE_STOP_TOKENS } from '../../src/core/commands.js'

describe('ccsp commands', () => {
  it('keeps parse stop tokens aligned with commander subcommands', () => {
    for (const subcommand of CCSP_COMMANDER_SUBCOMMANDS) {
      expect(CCSP_PARSE_STOP_TOKENS).toContain(subcommand)
    }
    expect(CCSP_PARSE_STOP_TOKENS).toContain('claude')
  })
})
