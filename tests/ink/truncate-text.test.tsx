import React from 'react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { TruncateText } from '../../src/ink/components/truncate-text.js'

describe('TruncateText', () => {
  it('defaults to tail truncation for long text', () => {
    const output = renderToString(
      <TruncateText>abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz</TruncateText>,
      { columns: 20 },
    )

    expect(output).toContain('…')
    expect(output.split('\n').length).toBe(1)
  })
})
