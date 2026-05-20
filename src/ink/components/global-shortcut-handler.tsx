import React from 'react'
import { useInput } from 'ink'

type ShortcutKey = {
  ctrl?: boolean
}

type Props = {
  onShortcut: (input: string, key: ShortcutKey) => void
  children: React.ReactNode
}

export function GlobalShortcutHandler({ onShortcut, children }: Props) {
  useInput((input, key) => {
    onShortcut(input, key)
  })

  return <>{children}</>
}
