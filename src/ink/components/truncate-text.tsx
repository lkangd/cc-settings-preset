import { Text, type TextProps } from 'ink'
import type { PropsWithChildren } from 'react'

export function TruncateText(props: PropsWithChildren<TextProps>) {
  return <Text wrap="truncate-end" {...props} />
}
