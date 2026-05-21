import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ManageApp } from '../../src/ink/manage-app.js'

type InputHandler = (input: string, key: { return?: boolean; upArrow?: boolean; downArrow?: boolean; escape?: boolean }) => void

type TextInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => Promise<void> | void
}

const inputHandlers: InputHandler[] = []
const exitMock = vi.fn()
const textInputProps: TextInputProps[] = []

vi.mock('ink', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('box', null, children),
  Text: ({ children }: { children?: React.ReactNode; color?: string }) => React.createElement('text', null, children),
  useApp: () => ({ exit: exitMock }),
  useInput: (handler: InputHandler) => {
    inputHandlers.push(handler)
  },
}))

vi.mock('../../src/ink/components/two-column-settings-view.js', () => ({
  TwoColumnSettingsView: ({ title, help }: { title: string; help: string }) => React.createElement('two-column-settings-view', { title, help }),
}))

vi.mock('../../src/ink/components/text-input.js', () => ({
  TextInput: (props: TextInputProps) => {
    textInputProps.push(props)
    return React.createElement('text-input', props)
  },
}))

vi.mock('../../src/services/reveal-service.js', () => ({
  revealInFinder: vi.fn(),
}))

function latestInputHandler(): InputHandler | undefined {
  return inputHandlers.at(-1)
}

describe('ManageApp interactions', () => {
  beforeEach(() => {
    inputHandlers.length = 0
    textInputProps.length = 0
    exitMock.mockReset()
  })

  it('does not launch the active preset on enter', () => {
    const onSubmit = vi.fn()
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ManageApp
          items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: {} }]}
          onSubmit={onSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    const view = output!.root.findByType('two-column-settings-view' as unknown as React.ComponentType)
    expect(view.props.help).toContain('l launch')
    expect(view.props.help).not.toContain('enter/l launch')
    expect(onSubmit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'launch' }))
    expect(exitMock).not.toHaveBeenCalled()
  })

  it('launches the active preset on l', () => {
    const onSubmit = vi.fn()

    act(() => {
      TestRenderer.create(
        <ManageApp
          items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: {} }]}
          onSubmit={onSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('l', {})
    })

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'launch',
      item: { name: 'base', sourcePath: '/tmp/base.json', settings: {} },
    })
    expect(exitMock).toHaveBeenCalledOnce()
  })

  it('prefills the current preset name when entering rename mode', () => {
    act(() => {
      TestRenderer.create(
        <ManageApp
          items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: {} }]}
          onSubmit={vi.fn()}
          onRenameSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('r', {})
    })

    expect(textInputProps.at(-1)?.value).toBe('base')
  })

  it('keeps the app open after a successful rename and updates the visible item', async () => {
    const onSubmit = vi.fn()
    const onRenameSubmit = vi.fn().mockResolvedValue(null)
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ManageApp
          items={[{ name: 'base', sourcePath: '/tmp/base.json', settings: {} }]}
          onSubmit={onSubmit}
          onRenameSubmit={onRenameSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('r', {})
    })

    act(() => {
      textInputProps.at(-1)?.onChange('renamed')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(onRenameSubmit).toHaveBeenCalledWith({ name: 'base', sourcePath: '/tmp/base.json', settings: {} }, 'renamed')
    expect(onSubmit).not.toHaveBeenCalledWith({ type: 'refresh' })
    expect(exitMock).not.toHaveBeenCalled()
    expect(output!.toJSON() && JSON.stringify(output!.toJSON())).toContain('renamed')
    expect(output!.toJSON() && JSON.stringify(output!.toJSON())).toContain('Preset renamed successfully')
  })
})
