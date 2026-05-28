import { describe, expect, it } from 'vitest'
import { resolveSessionLaunch, sanitizeClaudeArgs } from '../../src/core/args.js'

const UUID = '11111111-1111-4111-8111-111111111111'

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

describe('resolveSessionLaunch', () => {
  it('leaves args untouched on a fresh launch (Claude assigns the id)', () => {
    const result = resolveSessionLaunch(['--model', 'opus'])
    expect(result.mode).toBe('launch')
    expect(result.sessionId).toBeUndefined()
    expect(result.args).toEqual(['--model', 'opus'])
  })

  it('reuses an explicit --session-id', () => {
    const result = resolveSessionLaunch(['--session-id', UUID])
    expect(result.mode).toBe('launch')
    expect(result.sessionId).toBe(UUID)
    expect(result.args).toEqual(['--session-id', UUID])
  })

  it('binds to a concrete --resume uuid', () => {
    expect(resolveSessionLaunch(['--resume', UUID])).toEqual({
      args: ['--resume', UUID],
      mode: 'resume',
      sessionId: UUID,
    })
    expect(resolveSessionLaunch(['-r', UUID]).sessionId).toBe(UUID)
    expect(resolveSessionLaunch([`--resume=${UUID}`]).sessionId).toBe(UUID)
  })

  it('stays unmanaged for picker resume, continue, or non-uuid resume', () => {
    expect(resolveSessionLaunch(['--resume']).sessionId).toBeUndefined()
    expect(resolveSessionLaunch(['--resume', 'search term']).sessionId).toBeUndefined()
    expect(resolveSessionLaunch(['--continue']).sessionId).toBeUndefined()
    expect(resolveSessionLaunch(['-c']).sessionId).toBeUndefined()
    for (const args of [['--resume'], ['--continue'], ['-c'], ['--resume', 'foo']]) {
      const result = resolveSessionLaunch(args)
      expect(result.mode).toBe(args[0] === '--continue' || args[0] === '-c' ? 'continue' : 'resume')
      expect(result.args).toEqual(args)
    }
  })
})
