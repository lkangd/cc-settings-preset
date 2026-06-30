import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateApp, type CreateSubmitResult } from '../../src/ink/create-app.js'

type InputHandler = (input: string, key: { return?: boolean; upArrow?: boolean; downArrow?: boolean; escape?: boolean }) => void

type TextInputProps = {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void | Promise<void>
}

const inputHandlers: InputHandler[] = []
const exitMock = vi.fn()
const textInputProps: TextInputProps[] = []

vi.mock('ink', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('box', null, children),
  Text: ({ children, color, bold, dimColor }: { children?: React.ReactNode; color?: string; bold?: boolean; dimColor?: boolean }) => React.createElement('text', { color, bold, dimColor }, children),
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

function latestInputHandler(): InputHandler | undefined {
  return inputHandlers.at(-1)
}

function flattenJson(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
  if (!node) return ''
  if (Array.isArray(node)) return node.map(flattenJson).join(' ')
  const children = node.children?.map(child => (typeof child === 'string' ? child : flattenJson(child))).join(' ') ?? ''
  return [typeof node.type === 'string' ? node.type : '', children].join(' ').trim()
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('CreateApp interactions', () => {
  beforeEach(() => {
    inputHandlers.length = 0
    textInputProps.length = 0
    exitMock.mockReset()
  })

  it('keeps the user on manual path input and warns when submitting an empty path', async () => {
    const onSubmit = vi.fn()
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <CreateApp
          sources={[]}
          onSubmit={onSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    expect(textInputProps.at(-1)?.label).toBe('Settings JSON path')

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(textInputProps.at(-1)?.label).toBe('Settings JSON path')
    expect(flattenJson(output!.toJSON())).toContain('Settings JSON path is required')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(exitMock).not.toHaveBeenCalled()
  })

  it('keeps the user on the name step when the preset name already exists', async () => {
    const onSubmit = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'Preset already exists: glm-5.1' } satisfies CreateSubmitResult)
      .mockResolvedValueOnce({ ok: true } satisfies CreateSubmitResult)
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <CreateApp
          sources={[]}
          onSubmit={onSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    act(() => {
      textInputProps.at(-1)?.onChange('/Users/liangkangda/.claude/settings.json')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(textInputProps.at(-1)?.label).toBe('Preset name')
    expect(textInputProps.at(-1)?.value).toBe('settings')

    act(() => {
      textInputProps.at(-1)?.onChange('glm-5.1')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(onSubmit).toHaveBeenCalledWith({ sourcePath: '/Users/liangkangda/.claude/settings.json', name: 'glm-5.1' })
    expect(exitMock).not.toHaveBeenCalled()
    expect(flattenJson(output!.toJSON())).toContain('Preset already exists: glm-5.1')
    expect(textInputProps.at(-1)?.label).toBe('Preset name')
    expect(textInputProps.at(-1)?.value).toBe('glm-5.1')

    act(() => {
      textInputProps.at(-1)?.onChange('glm-5.1-alt')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(onSubmit).toHaveBeenLastCalledWith({ sourcePath: '/Users/liangkangda/.claude/settings.json', name: 'glm-5.1-alt' })
    expect(exitMock).toHaveBeenCalledOnce()
    expect(flattenJson(output!.toJSON())).not.toContain('Preset already exists: glm-5.1')
  })

  it('shows unexpected submit errors inline instead of exiting', async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error('File not found: /missing/settings.json'))
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <CreateApp
          sources={[]}
          onSubmit={onSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    act(() => {
      textInputProps.at(-1)?.onChange('/missing/settings.json')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    act(() => {
      textInputProps.at(-1)?.onChange('missing')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(exitMock).not.toHaveBeenCalled()
    expect(flattenJson(output!.toJSON())).toContain('File not found: /missing/settings.json')
    expect(textInputProps.at(-1)?.label).toBe('Preset name')
  })

  it('ignores stale submit results after cancel', async () => {
    const deferred = createDeferred<CreateSubmitResult>()
    const onSubmit = vi.fn().mockReturnValueOnce(deferred.promise)
    let output: TestRenderer.ReactTestRenderer

    act(() => {
      output = TestRenderer.create(
        <CreateApp
          sources={[]}
          onSubmit={onSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    act(() => {
      textInputProps.at(-1)?.onChange('/Users/liangkangda/.claude/settings.json')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    act(() => {
      textInputProps.at(-1)?.onChange('settings')
    })

    const submitPromise = textInputProps.at(-1)!.onSubmit()

    act(() => {
      textInputProps.at(-1)?.onCancel()
    })

    await act(async () => {
      deferred.resolve({ ok: true })
      await submitPromise
    })

    expect(exitMock).not.toHaveBeenCalled()
    expect(flattenJson(output!.toJSON())).toContain('Manual path')
  })

  it('prevents duplicate submits while a request is in flight', async () => {
    const deferred = createDeferred<CreateSubmitResult>()
    const onSubmit = vi.fn().mockReturnValueOnce(deferred.promise)

    act(() => {
      TestRenderer.create(
        <CreateApp
          sources={[]}
          onSubmit={onSubmit}
        />,
      )
    })

    act(() => {
      latestInputHandler()?.('', { return: true })
    })

    act(() => {
      textInputProps.at(-1)?.onChange('/Users/liangkangda/.claude/settings.json')
    })

    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    act(() => {
      textInputProps.at(-1)?.onChange('settings')
    })

    const pendingSubmit = textInputProps.at(-1)!.onSubmit()
    await act(async () => {
      await textInputProps.at(-1)?.onSubmit()
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)

    await act(async () => {
      deferred.resolve({ ok: true })
      await pendingSubmit
    })
  })
})
