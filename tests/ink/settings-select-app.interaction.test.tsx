import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsSelectApp } from '../../src/ink/settings-select-app.js'

type InputHandler = (input: string, key: { return?: boolean; upArrow?: boolean; downArrow?: boolean; escape?: boolean }) => void

const inputHandlers: InputHandler[] = []
const exitMock = vi.fn()

vi.mock('ink', () => ({
  Text: (props: { children?: React.ReactNode; color?: string; dimColor?: boolean }) => React.createElement('text', props, props.children),
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

  it('renders header notice before settings view without centered padding', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <SettingsSelectApp
          headerNotice="CC-Settings-Preset v1.2.4"
          items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: {} }]}
          onSubmit={vi.fn()}
        />,
      )
    })

    const rendered = JSON.stringify(output!.toJSON())
    const noticeIndex = rendered.indexOf('CC-Settings-Preset v1.2.4')
    const settingsViewIndex = rendered.indexOf('two-column-settings-view')

    expect(noticeIndex).toBeGreaterThanOrEqual(0)
    expect(settingsViewIndex).toBeGreaterThanOrEqual(0)
    expect(rendered).not.toContain(' CC-Settings-Preset v1.2.4')
    expect(noticeIndex).toBeLessThan(settingsViewIndex)
  })

  it('renders update notice in yellow when header includes an update', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <SettingsSelectApp
          headerNotice="CC-Settings-Preset v1.2.0"
          headerUpdateNotice="Update available: v1.2.4 (current v1.2.0) · run ccsp update"
          items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: {} }]}
          onSubmit={vi.fn()}
        />,
      )
    })

    const yellowText = output!.root.findAllByType('text').find(node => node.props.color === 'yellow')

    expect(yellowText?.props.children).toBe('Update available: v1.2.4 (current v1.2.0) · run ccsp update')
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
