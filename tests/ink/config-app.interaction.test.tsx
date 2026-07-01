import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigApp } from '../../src/ink/config-app.js'

type InputHandler = (input: string, key: { return?: boolean; upArrow?: boolean; downArrow?: boolean; escape?: boolean }) => void

const inputHandlers: InputHandler[] = []
const exitMock = vi.fn()

vi.mock('ink', () => ({
  Box: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('box', props, children),
  Text: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement('text', props, children),
  useApp: () => ({ exit: exitMock }),
  useInput: (handler: InputHandler) => {
    inputHandlers.push(handler)
  },
  useStdout: () => ({ stdout: { columns: 100 } }),
}))

vi.mock('../../src/ink/components/bordered-title-box.js', () => ({
  BorderedTitleBox: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('bordered-title-box', props, children),
}))

vi.mock('../../src/ink/components/resize-context.js', () => ({
  useInkResizeVersion: () => undefined,
}))

function latestInputHandler(): InputHandler | undefined {
  return inputHandlers.at(-1)
}

describe('ConfigApp interactions', () => {
  beforeEach(() => {
    inputHandlers.length = 0
    exitMock.mockReset()
  })

  it('expands both columns for the long run mode description', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ConfigApp
          initialConfig={{
            globalPresetEnvOnly: true,
            statusLineEnabled: true,
            settingsDisplayFormat: 'yaml',
            runMode: 'both',
            bannerEnabled: true,
          }}
          onChange={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('j', {})
      latestInputHandler()?.('j', {})
      latestInputHandler()?.('j', {})
      latestInputHandler()?.('j', {})
    })

    const boxes = output!.root.findAll(node => String(node.type as unknown) === 'bordered-title-box')
    expect(boxes).toHaveLength(2)
    expect(boxes[1]?.props.title).toBe('Run mode')
    expect(boxes[0]?.props.height).toBeUndefined()
    expect(boxes[1]?.props.height).toBeUndefined()
  })
})
