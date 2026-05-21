import { afterEach, describe, expect, test, vi } from 'vitest'
import { createProgram, printBanner } from '../src/cli.js'

describe('CLI scaffold', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('exposes the package CLI name', () => {
    expect(createProgram().name()).toBe('ccsp/cc-settings-preset')
  })

  test('prints the banner to stderr', () => {
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    printBanner()

    expect(write).toHaveBeenCalledTimes(1)
    expect(String(write.mock.calls[0]?.[0] ?? '')).toContain('CC-Settings-Preset')
  })
})
