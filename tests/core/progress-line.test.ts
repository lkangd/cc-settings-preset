import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProgressLine } from '../../src/core/progress-line.js'

const CLEAR_LINE = '\r\x1b[2K'

function createStream(options: { isTTY?: boolean; columns?: number } = {}) {
  const writes: string[] = []
  return {
    writes,
    write: (chunk: string) => {
      writes.push(chunk)
      return true
    },
    isTTY: options.isTTY ?? true,
    columns: options.columns ?? 80,
  }
}

describe('createProgressLine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('redraws the current step in place and counts the seconds it has been running', () => {
    const stream = createStream()
    const line = createProgressLine(stream, { intervalMs: 100 })

    line.update('Installing plugin "demo"…')
    expect(stream.writes).toEqual([`${CLEAR_LINE}⠋ Installing plugin "demo"…`])

    // 每一帧都从行首重画，所以整段进度只占一行。
    vi.advanceTimersByTime(1000)
    const frames = stream.writes.slice(1)
    expect(frames.every(frame => frame.startsWith(CLEAR_LINE))).toBe(true)
    expect(frames.at(-1)).toBe(`${CLEAR_LINE}⠋ Installing plugin "demo"… 1s`)
  })

  it('restarts the elapsed reading when the step changes', () => {
    const stream = createStream()
    const line = createProgressLine(stream, { intervalMs: 100 })

    line.update('Installing plugin "first"…')
    vi.advanceTimersByTime(3000)
    line.update('Installing plugin "second"…')

    expect(stream.writes.at(-1)).toBe(`${CLEAR_LINE}⠋ Installing plugin "second"…`)
  })

  it('leaves the line empty and stops redrawing once stopped', () => {
    const stream = createStream()
    const line = createProgressLine(stream, { intervalMs: 100 })

    line.update('Installing plugin "demo"…')
    line.stop()
    const writesAfterStop = stream.writes.length
    vi.advanceTimersByTime(1000)

    expect(stream.writes.at(-1)).toBe(CLEAR_LINE)
    expect(stream.writes).toHaveLength(writesAfterStop)
  })

  it('stops cleanly when it was never updated', () => {
    const stream = createStream()

    createProgressLine(stream, { intervalMs: 100 }).stop()

    expect(stream.writes).toEqual([])
  })

  it('keeps the line inside the terminal so a redraw cannot leave a wrapped tail behind', () => {
    const stream = createStream({ columns: 20 })
    const line = createProgressLine(stream, { intervalMs: 100 })

    line.update('Installing plugin "a-very-long-plugin-name"…')

    expect(stream.writes[0]).toBe(`${CLEAR_LINE}⠋ Installing plugin`)
  })

  it('neutralizes control characters a step name carries into the line', () => {
    const stream = createStream()
    const line = createProgressLine(stream, { intervalMs: 100 })

    // 插件名来自 settings 文件，可以是任意字符串；换行会让上一帧跑到光标够不着的地方，
    // ESC 则等于把终端交给别人写的控制序列。
    line.update('Installing plugin "evil\r\n\x1b[31mred"…')

    // \r、\n、ESC 各换成一个空格，剩下的 `[31m` 只是普通字符，终端不会再当成颜色指令。
    expect(stream.writes[0]).toBe(`${CLEAR_LINE}⠋ Installing plugin "evil   [31mred"…`)
  })

  it('keeps a step name off its own line when the output is not a terminal', () => {
    const stream = createStream({ isTTY: false })

    createProgressLine(stream, { intervalMs: 100 }).update('Installing plugin "evil\nWarning: fake"…')

    expect(stream.writes).toEqual(['Installing plugin "evil Warning: fake"…\n'])
  })

  it('keeps going when the stream it draws on is gone', () => {
    const broken = {
      isTTY: true,
      columns: 80,
      write: () => {
        throw new Error('EPIPE')
      },
    }
    const line = createProgressLine(broken, { intervalMs: 100 })

    // 进度只是装饰：stderr 断了不能反过来终止它正在报告的安装，定时器里抛出更会直接掀掉进程。
    expect(() => line.update('Installing plugin "demo"…')).not.toThrow()
    expect(() => vi.advanceTimersByTime(500)).not.toThrow()
    expect(() => line.stop()).not.toThrow()
  })

  it('prints one plain line per step when the output is not a terminal', () => {
    const stream = createStream({ isTTY: false })
    const line = createProgressLine(stream, { intervalMs: 100 })

    line.update('Installing plugin "first"…')
    vi.advanceTimersByTime(1000)
    line.update('Installing plugin "second"…')
    line.stop()

    expect(stream.writes).toEqual([
      'Installing plugin "first"…\n',
      'Installing plugin "second"…\n',
    ])
  })
})
