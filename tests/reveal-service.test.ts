import { describe, expect, it, vi } from 'vitest'
import { revealInFinder } from '../src/services/reveal-service.js'

describe('revealInFinder', () => {
  it('reveals the file in Finder', () => {
    const spawnProcess = vi.fn()

    revealInFinder('/tmp/preset.json', spawnProcess as never)

    expect(spawnProcess).toHaveBeenCalledWith('open', ['-R', '/tmp/preset.json'], { stdio: 'ignore' })
  })

  it('does nothing for an empty path', () => {
    const spawnProcess = vi.fn()

    revealInFinder('', spawnProcess as never)

    expect(spawnProcess).not.toHaveBeenCalled()
  })
})
