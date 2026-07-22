import { useEffect, useState } from 'react'
import { Text } from 'ink'
import type { QuickSettingField } from '../../flows/settings-select-flow.js'

// Solid colors keyed by value. Values without an entry render in the default text color.
const MODE_COLORS: Record<string, string> = {
  acceptEdits: '#85F789',
  plan: '#A1E7FA',
  auto: '#F4BB78',
  dontAsk: '#EC625C',
  bypassPermissions: '#EC625C',
}

const EFFORT_COLORS: Record<string, string> = {
  low: '#F4BB78',
  medium: '#85F789',
  high: '#B695F3',
}

const XHIGH_BASE = '#85F789'
const XHIGH_HIGHLIGHT = '#B695F3'
const ULTRACODE_BACKGROUND = '#8B5CF6'
const SCROLL_INTERVAL_MS = 150

const RAINBOW_PALETTE = ['#EC625C', '#F4BB78', '#F5F58A', '#85F789', '#A1E7FA', '#7DA6FF', '#B695F3']

// Advances a frame counter on a loop; returns 0 for single-character text and in static renders.
function useScrollFrame(length: number): number {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (length <= 1) return
    const timer = setInterval(() => setFrame(current => current + 1), SCROLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [length])

  return frame
}

// Renders per-character animated text; `colorAt` picks each character's color from its index and
// the current frame. Used for the sweeping xhigh highlight and the scrolling max rainbow.
function AnimatedText({ text, colorAt }: { text: string; colorAt: (index: number, frame: number) => string }) {
  const frame = useScrollFrame(text.length)

  return (
    <Text>
      {[...text].map((char, index) => (
        <Text key={index} color={colorAt(index, frame)}>{char}</Text>
      ))}
    </Text>
  )
}

const sweepColorAt = (length: number) => (index: number, frame: number) =>
  index === frame % Math.max(length, 1) ? XHIGH_HIGHLIGHT : XHIGH_BASE

const rainbowColorAt = (index: number, frame: number) =>
  RAINBOW_PALETTE[(index + frame) % RAINBOW_PALETTE.length]!

export function QuickSettingValue({ field, value }: { field: QuickSettingField; value: string }) {
  if (field === 'effortLevel') {
    if (value === 'xhigh') return <AnimatedText text={value} colorAt={sweepColorAt(value.length)} />
    if (value === 'max') return <AnimatedText text={value} colorAt={rainbowColorAt} />
    if (value === 'ultracode') return <Text backgroundColor={ULTRACODE_BACKGROUND} color="white">{value}</Text>
    const color = EFFORT_COLORS[value]
    return color ? <Text color={color}>{value}</Text> : <Text>{value}</Text>
  }

  const color = MODE_COLORS[value]
  return color ? <Text color={color}>{value}</Text> : <Text>{value}</Text>
}
