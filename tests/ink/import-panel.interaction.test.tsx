import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportPanel, type ImportCandidateView } from '../../src/ink/components/import-panel.js'

type InputHandler = (input: string, key: { return?: boolean; escape?: boolean; upArrow?: boolean; downArrow?: boolean }) => void

type TextInputProps = {
  label: string
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => Promise<void> | void
}

const inputHandlers: InputHandler[] = []
const textInputProps: TextInputProps[] = []

vi.mock('ink', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('box', null, children),
  Text: ({ children, ...props }: { children?: React.ReactNode; color?: string }) => React.createElement('text', props, children),
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

const template: ImportCandidateView = {
  id: 'candidate-0',
  kind: 'template',
  presetName: 'shared',
  counts: { plugins: 12, skills: 3, mcps: 1 },
  missingCount: 4,
}

const projectPreset: ImportCandidateView = {
  id: 'candidate-1',
  kind: 'project',
  presetName: 'web-dev',
  projectLabel: 'vibessage',
  counts: { plugins: 2, skills: 0, mcps: 0 },
  missingCount: 0,
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof ImportPanel>> = {}) {
  const props = {
    candidates: [template, projectPreset],
    onImport: vi.fn().mockResolvedValue({ ok: true }),
    onRenameTemplate: vi.fn().mockResolvedValue({ ok: true }),
    onDeleteTemplate: vi.fn().mockResolvedValue({ ok: true }),
    onClose: vi.fn(),
    ...overrides,
  }
  let output: TestRenderer.ReactTestRenderer

  act(() => {
    output = TestRenderer.create(<ImportPanel {...props} />)
  })

  return { output: output!, props }
}

describe('ImportPanel interactions', () => {
  beforeEach(() => {
    inputHandlers.length = 0
    textInputProps.length = 0
  })

  it('groups templates and recent projects in one list', () => {
    const { output } = renderPanel()
    const text = flattenJson(output.toJSON())

    expect(text).toContain('Global templates')
    expect(text).toContain('shared')
    expect(text).toContain('Recent projects')
    expect(text).toContain('vibessage / web-dev')
  })

  it('shows how much of the focused candidate this project can use', () => {
    const { output } = renderPanel()

    expect(flattenJson(output.toJSON())).toContain('overrides: 12 plugins · 3 skills · 1 mcps')
    expect(flattenJson(output.toJSON())).toContain('4 not installed here')
  })

  it('says so when nothing in the candidate is missing', () => {
    const { output } = renderPanel({ candidates: [projectPreset] })

    expect(flattenJson(output.toJSON())).toContain('all installed here')
  })

  it('skips group headers when moving the cursor', async () => {
    const { output, props } = renderPanel()

    act(() => {
      latestInputHandler()?.('j', {})
    })
    act(() => {
      latestInputHandler()?.('', { return: true })
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(props.onImport).toHaveBeenCalledWith('candidate-1', 'web-dev', false)
    expect(flattenJson(output.toJSON())).toBeDefined()
  })

  it('imports the focused candidate under its own name by default', async () => {
    const { props } = renderPanel()

    act(() => {
      latestInputHandler()?.('', { return: true })
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(props.onImport).toHaveBeenCalledWith('candidate-0', 'shared', false)
    expect(props.onClose).toHaveBeenCalledWith(true)
  })

  it('offers overwrite, rename and cancel when the name is taken', async () => {
    const onImport = vi.fn().mockResolvedValue({ ok: false, conflict: true, error: 'Launch preset already exists: shared' })
    const { output } = renderPanel({ onImport })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })
    await act(async () => {
      await Promise.resolve()
    })

    const text = flattenJson(output.toJSON())
    expect(text).toContain('Overwrite')
    expect(text).toContain('Rename')
    expect(text).toContain('Cancel')
    expect(text).toContain('already exists')
  })

  it('overwrites only after the choice is moved off the default', async () => {
    const onImport = vi.fn()
      .mockResolvedValueOnce({ ok: false, conflict: true, error: 'exists' })
      .mockResolvedValueOnce({ ok: true })
    const { props } = renderPanel({ onImport })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      latestInputHandler()?.('k', {})
    })
    act(() => {
      latestInputHandler()?.('', { return: true })
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(onImport).toHaveBeenLastCalledWith('candidate-0', 'shared', true)
    expect(props.onClose).toHaveBeenCalledWith(true)
  })

  it('cancels the conflict without importing anything', async () => {
    const onImport = vi.fn().mockResolvedValue({ ok: false, conflict: true, error: 'exists' })
    const { output, props } = renderPanel({ onImport })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })
    await act(async () => {
      await Promise.resolve()
    })
    act(() => {
      latestInputHandler()?.('', { escape: true })
    })

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(props.onClose).not.toHaveBeenCalledWith(true)
    expect(flattenJson(output.toJSON())).toContain('Global templates')
  })

  it('renames a template in place', async () => {
    const { output, props } = renderPanel()

    act(() => {
      latestInputHandler()?.('r', {})
    })
    act(() => {
      textInputProps.at(-1)?.onChange('frontend')
    })
    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(props.onRenameTemplate).toHaveBeenCalledWith('candidate-0', 'frontend')
    const text = flattenJson(output.toJSON())
    expect(text).toContain('frontend')
    expect(text).not.toContain('shared')
  })

  it('refuses to rename a preset that lives in another project', () => {
    const { output, props } = renderPanel()

    act(() => {
      latestInputHandler()?.('j', {})
    })
    act(() => {
      latestInputHandler()?.('r', {})
    })

    expect(props.onRenameTemplate).not.toHaveBeenCalled()
    expect(flattenJson(output.toJSON())).toContain('Only global templates can be renamed here')
  })

  it('drops a deleted template out of the list', async () => {
    const { output, props } = renderPanel()

    act(() => {
      latestInputHandler()?.('d', {})
    })
    await act(async () => {
      latestInputHandler()?.('y', {})
      await Promise.resolve()
    })

    expect(props.onDeleteTemplate).toHaveBeenCalledWith('candidate-0')
    const text = flattenJson(output.toJSON())
    expect(text).not.toContain('Global templates')
    expect(text).toContain('vibessage / web-dev')
  })

  it('leaves the cursor on a candidate after deleting the first one', async () => {
    const { output, props } = renderPanel()

    act(() => {
      latestInputHandler()?.('d', {})
    })
    await act(async () => {
      latestInputHandler()?.('y', {})
      await Promise.resolve()
    })
    act(() => {
      latestInputHandler()?.('', { return: true })
    })
    await act(async () => {
      await Promise.resolve()
    })

    // Deleting the only template also removes its header, so a cursor merely
    // stepped back one row would land on `Recent projects` and do nothing.
    expect(flattenJson(output.toJSON())).toContain('❯  vibessage / web-dev')
    expect(props.onImport).toHaveBeenCalledWith('candidate-1', 'web-dev', false)
  })

  it('explains an empty panel instead of showing a blank box', () => {
    const { output } = renderPanel({ candidates: [] })

    expect(flattenJson(output.toJSON())).toContain('nothing to import')
  })

  it('closes without importing on escape', () => {
    const { props } = renderPanel()

    act(() => {
      latestInputHandler()?.('', { escape: true })
    })

    expect(props.onClose).toHaveBeenCalledWith(false)
  })
})
