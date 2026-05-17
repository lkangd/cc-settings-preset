import { describe, expect, it } from 'vitest'
import { sanitizeClaudeArgs } from '../../src/core/args.js'

describe('sanitizeClaudeArgs', () => {
  it('removes --settings value pairs', () => {
    expect(sanitizeClaudeArgs(['--resume', 'abc', '--settings', 'ignored.json']).args).toEqual(['--resume', 'abc'])
  })

  it('removes --settings=value forms', () => {
    expect(sanitizeClaudeArgs(['--settings=ignored.json', '--resume', 'abc']).args).toEqual(['--resume', 'abc'])
  })

  it('reports whether settings was removed', () => {
    expect(sanitizeClaudeArgs(['--settings', 'ignored.json']).removedSettings).toBe(true)
    expect(sanitizeClaudeArgs(['--resume', 'abc']).removedSettings).toBe(false)
  })
})
