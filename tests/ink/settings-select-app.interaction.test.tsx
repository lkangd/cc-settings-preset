import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsSelectApp } from '../../src/ink/settings-select-app.js'

type InputHandler = (input: string, key: { return?: boolean; upArrow?: boolean; downArrow?: boolean; escape?: boolean }) => void

const inputHandlers: InputHandler[] = []
const exitMock = vi.fn()

vi.mock('ink', () => ({
  Text: ({ children }: { children?: React.ReactNode }) => React.createElement('text', null, children),
  useApp: () => ({ exit: exitMock }),
  useInput: (handler: InputHandler) => {
    inputHandlers.push(handler)
  },
}))

vi.mock('../../src/ink/components/two-column-settings-view.js', () => ({
  TwoColumnSettingsView: (props: Record<string, unknown>) => React.createElement('two-column-settings-view', props),
}))

function latestInputHandler(): InputHandler | undefined {
  return inputHandlers.at(-1)
}

describe('SettingsSelectApp interactions', () => {
  beforeEach(() => {
    inputHandlers.length = 0
    exitMock.mockReset()
  })

  it('shows the active sort mode when t is pressed', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <SettingsSelectApp
          items={[
            { name: '*Claude Official*', sourcePath: '/tmp/official.json', settings: {}, temporary: true },
            { name: 'beta', sourcePath: '/tmp/beta.json', settings: {}, updatedAt: '2026-06-02T00:00:00.000Z' },
            { name: 'alpha', sourcePath: '/tmp/alpha.json', settings: {}, updatedAt: '2026-06-03T00:00:00.000Z', isLastUsed: true },
          ]}
          onSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('t', {})
    })

    expect(JSON.stringify(output!.toJSON())).toContain('Sorted by name')

    act(() => {
      latestInputHandler()?.('t', {})
    })

    expect(JSON.stringify(output!.toJSON())).toContain('Sorted by updated')
  })

  it('cycles sort mode on t and keeps temporary items first', () => {
    let selectedName = ''

    act(() => {
      TestRenderer.create(
        <SettingsSelectApp
          items={[
            { name: '*Claude Official*', sourcePath: '/tmp/official.json', settings: {}, temporary: true },
            { name: 'beta', sourcePath: '/tmp/beta.json', settings: {}, updatedAt: '2026-06-02T00:00:00.000Z' },
            { name: 'alpha', sourcePath: '/tmp/alpha.json', settings: {}, updatedAt: '2026-06-03T00:00:00.000Z', isLastUsed: true },
          ]}
          onSubmit={value => {
            selectedName = value.name
          }}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('t', {})
      latestInputHandler()?.('t', {})
      latestInputHandler()?.('', { return: true })
    })

    expect(selectedName).toBe('*Claude Official*')
    expect(exitMock).toHaveBeenCalledOnce()
  })
})
