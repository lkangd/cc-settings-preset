import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectLaunchApp } from '../../src/ink/project-launch-app.js'

type InputHandler = (input: string, key: { return?: boolean; escape?: boolean }) => void

type TextInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
}

const inputHandlers: InputHandler[] = []
const exitMock = vi.fn()
const textInputProps: TextInputProps[] = []

vi.mock('ink', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('box', null, children),
  Text: ({ children }: { children?: React.ReactNode }) => React.createElement('text', null, children),
  Newline: () => React.createElement('newline'),
  useApp: () => ({ exit: exitMock }),
  useInput: (handler: InputHandler) => {
    inputHandlers.push(handler)
  },
}))

vi.mock('../../src/ink/components/text-input.js', () => ({
  TextInput: (props: TextInputProps) => {
    textInputProps.push(props)
    return React.createElement('text-input', props)
  },
}))

function flattenJson(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
  if (!node) return ''
  if (Array.isArray(node)) return node.map(flattenJson).join(' ')
  const children = node.children?.map(child => (typeof child === 'string' ? child : flattenJson(child))).join(' ') ?? ''
  return [typeof node.type === 'string' ? node.type : '', children].join(' ').trim()
}

function latestInputHandler(): InputHandler | undefined {
  return inputHandlers.at(-1)
}

describe('ProjectLaunchApp interactions', () => {
  beforeEach(() => {
    inputHandlers.length = 0
    textInputProps.length = 0
    exitMock.mockReset()
  })

  it('shows uppercase Y in save confirmation hint', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectLaunchApp
          presets={[]}
          detected={{
            plugins: [{ name: 'alpha', enabled: true, source: 'user' }],
            skills: [],
            mcps: [],
          }}
          statesByPreset={{}}
          onSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('p', {})
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    expect(flattenJson(output!.toJSON())).toContain('press Y to save · n for retained temp settings · esc cancel')
  })

  it('does not submit when the new preset name is empty', () => {
    const onSubmit = vi.fn()

    act(() => {
      TestRenderer.create(
        <ProjectLaunchApp
          presets={[]}
          detected={{
            plugins: [{ name: 'alpha', enabled: true, source: 'user' }],
            skills: [],
            mcps: [],
          }}
          statesByPreset={{}}
          onSubmit={onSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('p', {})
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    act(() => {
      latestInputHandler()?.('y', {})
    })

    act(() => {
      textInputProps.at(-1)?.onSubmit()
    })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(exitMock).not.toHaveBeenCalled()
  })
})
