import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ManageApp } from '../../src/ink/manage-app.js'

type InputHandler = (input: string, key: { return?: boolean; upArrow?: boolean; downArrow?: boolean; escape?: boolean; ctrl?: boolean; meta?: boolean }) => void

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
  TwoColumnSettingsView: (props: Record<string, unknown>) => React.createElement('two-column-settings-view', props),
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

  it('exits on esc in browse mode', () => {
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
      latestInputHandler()?.('', { escape: true })
    })

    expect(onSubmit).toHaveBeenCalledWith({ type: 'exit' })
    expect(exitMock).toHaveBeenCalledOnce()
  })

  it('cycles sort mode on t and shows the active sort at the bottom', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ManageApp
          items={[
            { name: 'gamma', sourcePath: '/tmp/gamma.json', settings: {}, updatedAt: '2026-06-01T00:00:00.000Z', isLastUsed: true },
            { name: 'alpha', sourcePath: '/tmp/alpha.json', settings: {}, updatedAt: '2026-06-02T00:00:00.000Z' },
            { name: 'beta', sourcePath: '/tmp/beta.json', settings: {}, updatedAt: '2026-06-03T00:00:00.000Z' },
          ]}
          onSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('t', {})
    })

    let view = output!.root.findByType('two-column-settings-view' as unknown as React.ComponentType)
    expect(view.props.items.map((item: { name: string }) => item.name)).toEqual(['alpha', 'beta', 'gamma'])
    expect(JSON.stringify(output!.toJSON())).toContain('Sorted by name')

    act(() => {
      latestInputHandler()?.('t', {})
    })

    view = output!.root.findByType('two-column-settings-view' as unknown as React.ComponentType)
    expect(view.props.items.map((item: { name: string }) => item.name)).toEqual(['beta', 'alpha', 'gamma'])
    expect(JSON.stringify(output!.toJSON())).toContain('Sorted by updated')
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

  it('does not launch on ctrl+l so the global refresh shortcut can handle it', () => {
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
      latestInputHandler()?.('l', { ctrl: true })
    })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(exitMock).not.toHaveBeenCalled()
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

  it('starts create flow on c', () => {
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
      latestInputHandler()?.('c', {})
    })

    expect(onSubmit).toHaveBeenCalledWith({ type: 'create' })
    expect(exitMock).toHaveBeenCalledOnce()
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

  it('keeps the renamed item in flow state when sorting afterward', async () => {
    const onRenameSubmit = vi.fn().mockResolvedValue(null)
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ManageApp
          items={[
            { name: 'base', sourcePath: '/tmp/base.json', settings: {}, updatedAt: '2026-06-01T00:00:00.000Z' },
            { name: 'work', sourcePath: '/tmp/work.json', settings: {}, updatedAt: '2026-06-02T00:00:00.000Z' },
          ]}
          onSubmit={vi.fn()}
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

    act(() => {
      latestInputHandler()?.('t', {})
    })

    const view = output!.root.findByType('two-column-settings-view' as unknown as React.ComponentType)
    expect(view.props.items.map((item: { name: string }) => item.name)).toContain('renamed')
    expect(view.props.items.map((item: { name: string }) => item.name)).not.toContain('base')
  })
})
