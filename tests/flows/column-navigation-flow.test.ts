import { describe, expect, it } from 'vitest'
import {
  escapeColumnFocus,
  moveColumnFocus,
} from '../../src/flows/column-navigation-flow.js'

describe('column navigation flow', () => {
  const focuses = ['presets', 'plugins', 'skills', 'mcps'] as const

  it('moves focus left and right within bounds', () => {
    expect(moveColumnFocus(focuses, 'presets', 1)).toBe('plugins')
    expect(moveColumnFocus(focuses, 'plugins', 1)).toBe('skills')
    expect(moveColumnFocus(focuses, 'plugins', -1)).toBe('presets')
    expect(moveColumnFocus(focuses, 'presets', -1)).toBe('presets')
    expect(moveColumnFocus(focuses, 'mcps', 1)).toBe('mcps')
  })

  it('returns to the primary focus on escape before bubbling', () => {
    expect(escapeColumnFocus('skills', 'presets')).toEqual({
      focus: 'presets',
      bubbled: false,
    })
  })

  it('bubbles escape when already on the primary focus', () => {
    expect(escapeColumnFocus('presets', 'presets')).toEqual({
      focus: 'presets',
      bubbled: true,
    })
  })
})
