import { Box, Text, type TextProps } from 'ink'
import type { PropsWithChildren } from 'react'
import { measureDisplayWidth, truncateToDisplayWidth } from '../../core/display-width.js'

type Props = PropsWithChildren<{
  title: string
  width: number
  borderColor: NonNullable<TextProps['color']>
  height?: number
  paddingX?: number
  paddingY?: number
}>

const LEFT_TITLE_BORDER = '╭─┐ '
const RIGHT_TITLE_BORDER = ' ┌'
const RIGHT_CORNER = '╮'

export const BORDERED_TITLE_BOX_FRAME_LINES = 2

const fixedTitleWidth = measureDisplayWidth(LEFT_TITLE_BORDER) + measureDisplayWidth(RIGHT_TITLE_BORDER) + measureDisplayWidth(RIGHT_CORNER)

function clipTitle(title: string, width: number): string {
  const maxTitleWidth = Math.max(0, width - fixedTitleWidth)
  return truncateToDisplayWidth(title, maxTitleWidth)
}

export function BorderedTitleBox({
  title,
  width,
  borderColor,
  height,
  paddingX = 0.5,
  paddingY = 0,
  children,
}: Props) {
  const displayTitle = clipTitle(title, width)
  const fillWidth = Math.max(0, width - fixedTitleWidth - measureDisplayWidth(displayTitle))

  return (
    <Box flexDirection="column" width={width} {...(height === undefined ? {} : { height })}>
      <Box width={width}>
        <Text color={borderColor}>{LEFT_TITLE_BORDER}</Text>
        <Text bold>{displayTitle}</Text>
        <Text color={borderColor}>{`${RIGHT_TITLE_BORDER}${'─'.repeat(fillWidth)}${RIGHT_CORNER}`}</Text>
      </Box>
      <Box
        flexDirection="column"
        width={width}
        flexGrow={1}
        borderStyle="round"
        borderColor={borderColor}
        borderTop={false}
        paddingX={paddingX}
        paddingY={paddingY}
      >
        {children}
      </Box>
    </Box>
  )
}
