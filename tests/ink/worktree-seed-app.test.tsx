import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorktreeSeedApp } from '../../src/ink/worktree-seed-app.js'

type InputHandler = (input: string, key: { return?: boolean; escape?: boolean }) => void

const inputHandlers: InputHandler[] = []
const exitMock = vi.fn()

vi.mock('ink', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('box', null, children),
  Text: ({ children, ...props }: { children?: React.ReactNode; color?: string }) => React.createElement('text', props, children),
  useApp: () => ({ exit: exitMock }),
  useInput: (handler: InputHandler) => {
    inputHandlers.push(handler)
  },
  useStdout: () => ({ stdout: { columns: 120 } }),
}))

function flattenJson(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null): string {
  if (!node) return ''
  if (Array.isArray(node)) return node.map(flattenJson).join(' ')
  const children = node.children?.map(child => (typeof child === 'string' ? child : flattenJson(child))).join(' ') ?? ''
  return [typeof node.type === 'string' ? node.type : '', children].join(' ').trim()
}

function renderApp(onSubmit = vi.fn()) {
  let output: TestRenderer.ReactTestRenderer

  act(() => {
    output = TestRenderer.create(
      <WorktreeSeedApp
        mainRoot="/repos/main"
        presetNames={['web-dev', 'debug']}
        lastUsedName="web-dev"
        onSubmit={onSubmit}
      />,
    )
  })

  return { output: output!, onSubmit }
}

describe('WorktreeSeedApp', () => {
  beforeEach(() => {
    inputHandlers.length = 0
    exitMock.mockReset()
  })

  it('names the main repository and what would be inherited', () => {
    const { output } = renderApp()
    const text = flattenJson(output.toJSON())

    expect(text).toContain('/repos/main')
    expect(text).toContain('web-dev')
    expect(text).toContain('debug')
    expect(text).toContain('(last used)')
  })

  it('says the copies are independent', () => {
    const { output } = renderApp()

    expect(flattenJson(output.toJSON())).toContain('will not affect the main repository')
  })

  it('inherits on y', () => {
    const { onSubmit } = renderApp()

    act(() => {
      inputHandlers.at(-1)?.('y', {})
    })

    expect(onSubmit).toHaveBeenCalledWith('accept')
    expect(exitMock).toHaveBeenCalled()
  })

  it('skips on n and warns it will not ask again', () => {
    const { output, onSubmit } = renderApp()

    expect(flattenJson(output.toJSON())).toContain('you will not be asked again')

    act(() => {
      inputHandlers.at(-1)?.('n', {})
    })

    expect(onSubmit).toHaveBeenCalledWith('decline')
  })

  it('treats escape as skipping', () => {
    const { onSubmit } = renderApp()

    act(() => {
      inputHandlers.at(-1)?.('', { escape: true })
    })

    expect(onSubmit).toHaveBeenCalledWith('decline')
  })
})
