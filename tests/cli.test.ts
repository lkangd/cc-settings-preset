import { describe, expect, it } from 'vitest'
import { sanitizeClaudeArgs } from '../src/core/args.js'

describe('cli argument behavior', () => {
  it('keeps claude passthrough args while stripping reserved settings', () => {
    expect(sanitizeClaudeArgs(['--resume', 'abc', '--settings=bad.json']).args).toEqual(['--resume', 'abc'])
  })
})
