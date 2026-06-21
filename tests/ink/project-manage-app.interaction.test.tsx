import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectManageApp } from '../../src/ink/project-manage-app.js'

type InputHandler = (input: string, key: { return?: boolean; escape?: boolean; leftArrow?: boolean; rightArrow?: boolean; upArrow?: boolean; downArrow?: boolean; ctrl?: boolean; meta?: boolean }) => void

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
  Text: ({ children, ...props }: { children?: React.ReactNode; color?: string }) => React.createElement('text', props, children),
  useApp: () => ({ exit: exitMock }),
  useInput: (handler: InputHandler) => {
    inputHandlers.push(handler)
  },
  useStdout: () => ({ stdout: { columns: 120 } }),
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

describe('ProjectManageApp interactions', () => {
  beforeEach(() => {
    inputHandlers.length = 0
    textInputProps.length = 0
    exitMock.mockReset()
  })

  it('keeps the active saved preset in place after saving and shows success feedback', async () => {
    const onSubmit = vi.fn()
    const onSaveSubmit = vi.fn().mockResolvedValue(null)
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[{ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{ web: { plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] } }}
          lastUsedName="web"
          onSubmit={onSubmit}
          onSaveSubmit={onSaveSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(onSaveSubmit).toHaveBeenCalledWith('web', { plugins: [{ name: 'alpha', enabled: false, source: 'user' }], skills: [], mcps: [] })
    expect(onSubmit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'save' }))
    expect(exitMock).not.toHaveBeenCalled()
    expect(flattenJson(output!.toJSON())).toContain('Preset saved successfully')

    act(() => {
      latestInputHandler()?.('t', {})
    })

    expect(flattenJson(output!.toJSON())).toContain('Sorted by name')
    expect(flattenJson(output!.toJSON())).not.toContain('Preset saved successfully')

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    expect(flattenJson(output!.toJSON())).not.toContain('Sorted by name')
    expect(flattenJson(output!.toJSON())).not.toContain('Preset saved successfully')
  })


  it('renders save errors with the app-specific red message color in browse mode', async () => {
    const onSubmit = vi.fn()
    const onSaveSubmit = vi.fn().mockResolvedValue('Save failed: permission denied')
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[{ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{ web: { plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] } }}
          lastUsedName="web"
          onSubmit={onSubmit}
          onSaveSubmit={onSaveSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    await act(async () => {
      await Promise.resolve()
    })

    const redTextNodes = output!.root.findAll(
      node => node.type === 'text' && node.props.color === 'red',
    )
    expect(redTextNodes.some(node => node.children.includes('Save failed: permission denied'))).toBe(true)
    expect(flattenJson(output!.toJSON())).toContain('Save failed: permission denied')
    expect(exitMock).not.toHaveBeenCalled()
  })

  it('creates a new preset from detected on enter after toggling', async () => {
    const onCreateSubmit = vi.fn().mockResolvedValue(null)
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{}}
          onSubmit={vi.fn()}
          onCreateSubmit={onCreateSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    expect(textInputProps.at(-1)?.label).toBe('Project launch preset name')
    expect(textInputProps.at(-1)?.value).toBe('')
    expect(flattenJson(output!.toJSON())).toContain('text-input')

    act(() => {
      textInputProps.at(-1)?.onChange('fresh')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(flattenJson(output!.toJSON())).toContain('Presets( 2 )')
    expect(flattenJson(output!.toJSON())).toContain('fresh')
    expect(flattenJson(output!.toJSON())).toMatch(/❯\s+fresh/)
    expect(flattenJson(output!.toJSON())).not.toMatch(/❯\s+Detected/)
  })

  it('keeps create errors in the input when the new preset name conflicts', async () => {
    const onSubmit = vi.fn()
    const onCreateSubmit = vi.fn().mockResolvedValue('Launch preset already exists: fff')
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{}}
          onSubmit={onSubmit}
          onCreateSubmit={onCreateSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    act(() => {
      textInputProps.at(-1)?.onChange('fff')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(onCreateSubmit).toHaveBeenCalledWith('fff', { plugins: [{ name: 'alpha', enabled: false, source: 'user' }], skills: [], mcps: [] })
    expect(exitMock).not.toHaveBeenCalled()
    expect(flattenJson(output!.toJSON())).toContain('Launch preset already exists: fff')
    expect(textInputProps.at(-1)?.value).toBe('fff')
  })

  it('keeps rename errors in the input and returns to the list after success', async () => {
    const onSubmit = vi.fn()
    const onRenameSubmit = vi.fn()
      .mockResolvedValueOnce('Launch preset already exists: app')
      .mockResolvedValueOnce(null)
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[{ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }]}
          detected={{ plugins: [], skills: [], mcps: [] }}
          statesByPreset={{ web: { plugins: [], skills: [], mcps: [] } }}
          lastUsedName="web"
          onSubmit={onSubmit}
          onRenameSubmit={onRenameSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('r', {})
    })

    expect(textInputProps.at(-1)?.value).toBe('web')

    act(() => {
      textInputProps.at(-1)?.onChange('app')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(flattenJson(output!.toJSON())).toContain('Launch preset already exists: app')
    expect(exitMock).not.toHaveBeenCalled()

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(onSubmit).not.toHaveBeenCalledWith({ type: 'refresh' })
    expect(flattenJson(output!.toJSON())).toContain('Manage project launch presets')
    expect(flattenJson(output!.toJSON())).toContain('Preset renamed successfully')
    expect(flattenJson(output!.toJSON())).toContain('app')
    expect(exitMock).not.toHaveBeenCalled()
  })

  it('returns to the list when esc cancels create mode', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{}}
          onSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    act(() => {
      textInputProps.at(-1)?.onCancel()
    })

    expect(flattenJson(output!.toJSON())).toContain('Manage project launch presets')
    expect(flattenJson(output!.toJSON())).toContain('Detected')
  })

  it('returns focus to presets when esc is pressed in browse mode', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{}}
          onSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    expect(flattenJson(output!.toJSON())).not.toMatch(/❯\s+Detected/)

    act(() => {
      latestInputHandler()?.('', { escape: true })
    })

    expect(flattenJson(output!.toJSON())).toMatch(/❯\s+Detected/)
    expect(exitMock).not.toHaveBeenCalled()
  })

  it('exits the management screen when esc is pressed from the presets column', () => {
    act(() => {
      TestRenderer.create(
        <ProjectManageApp
          presets={[]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{}}
          onSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { escape: true })
    })

    expect(exitMock).toHaveBeenCalledOnce()
  })

  it('returns focus to presets when esc leaves rename mode', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[{ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }]}
          detected={{ plugins: [], skills: [], mcps: [] }}
          statesByPreset={{ web: { plugins: [], skills: [], mcps: [] } }}
          lastUsedName="web"
          onSubmit={vi.fn()}
          onRenameSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('r', {})
    })

    act(() => {
      textInputProps.at(-1)?.onCancel()
    })

    expect(flattenJson(output!.toJSON())).toContain('Manage project launch presets')
    expect(flattenJson(output!.toJSON())).toContain('Detected')
    expect(flattenJson(output!.toJSON())).toContain('web')
  })

  it('shows the active sort mode when t is pressed', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{}}
          onSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('t', {})
    })

    expect(flattenJson(output!.toJSON())).toContain('Sorted by name')

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    expect(flattenJson(output!.toJSON())).not.toContain('Sorted by name')
  })

  it('shows detected save guidance when space is pressed on the detected preset row', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{}}
          onSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    expect(flattenJson(output!.toJSON())).toContain('Press enter to create a new preset from Detected')
  })

  it('does not show detected save guidance when toggling details while detected is selected', () => {
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <ProjectManageApp
          presets={[]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{}}
          onSubmit={vi.fn()}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    expect(flattenJson(output!.toJSON())).not.toContain('Press enter to create a new preset from Detected')
  })

  it('launches with save-first behavior on l when an existing preset is dirty', async () => {
    const onSubmit = vi.fn()
    const onSaveSubmit = vi.fn().mockResolvedValue(null)

    act(() => {
      TestRenderer.create(
        <ProjectManageApp
          presets={[{ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }]}
          detected={{ plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] }}
          statesByPreset={{ web: { plugins: [{ name: 'alpha', enabled: true, source: 'user' }], skills: [], mcps: [] } }}
          lastUsedName="web"
          onSubmit={onSubmit}
          onSaveSubmit={onSaveSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { rightArrow: true })
    })

    act(() => {
      latestInputHandler()?.(' ', {})
    })

    act(() => {
      latestInputHandler()?.('l', {})
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(onSaveSubmit).toHaveBeenCalledWith('web', { plugins: [{ name: 'alpha', enabled: false, source: 'user' }], skills: [], mcps: [] })
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'launch',
      presetName: 'web',
      toggles: { plugins: [{ name: 'alpha', enabled: false, source: 'user' }], skills: [], mcps: [] },
    })
  })

  it('does not launch on ctrl+l so the global refresh shortcut can handle it', () => {
    const onSubmit = vi.fn()

    act(() => {
      TestRenderer.create(
        <ProjectManageApp
          presets={[{ name: 'web', fileName: 'web-launch.json', createdAt: '2026-05-19T00:00:00.000Z', updatedAt: '2026-05-19T00:00:00.000Z' }]}
          detected={{ plugins: [], skills: [], mcps: [] }}
          statesByPreset={{ web: { plugins: [], skills: [], mcps: [] } }}
          lastUsedName="web"
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
})
