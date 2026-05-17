declare module 'cross-spawn' {
  import type { SpawnOptions } from 'node:child_process'
  import type { EventEmitter } from 'node:events'
  import type { Readable, Writable } from 'node:stream'

  type ChildProcessLike = EventEmitter & {
    stdout?: Readable | null
    stderr?: Readable | null
    stdin?: Writable | null
    once(event: 'error', listener: (error: Error) => void): ChildProcessLike
    once(event: 'close', listener: (code: number | null) => void): ChildProcessLike
  }

  export default function spawn(
    command: string,
    args?: readonly string[],
    options?: SpawnOptions,
  ): ChildProcessLike
}
