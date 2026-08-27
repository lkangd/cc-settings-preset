import { useEffect, useState } from 'react'
import { Text } from 'ink'
import type {
  BuiltInOutputStyle,
  EffortLevel,
  PermissionDefaultMode,
  QuickSettingField,
} from '../../flows/settings-select-flow.js'

// Every hue this column can render, stated once. The maps below name a token rather than repeating
// a literal, so a palette tweak is one edit and two rows that look identical today stay identical.
const PALETTE = {
  red: '#EC625C',
  amber: '#F4BB78',
  yellow: '#F5F58A',
  green: '#85F789',
  cyan: '#A1E7FA',
  blue: '#7DA6FF',
  violet: '#B695F3',
  ultracode: '#8B5CF6',
} as const

// `Default` and every custom style stay uncolored, which is what separates the built-ins from the
// styles discovered in ~/.claude/output-styles at a glance. Keyed off BuiltInOutputStyle so adding
// or renaming a built-in fails to compile until it gets a color here.
const OUTPUT_STYLE_COLORS = {
  Proactive: PALETTE.amber,
  Concise: PALETTE.yellow,
  Explanatory: PALETTE.cyan,
  Learning: PALETTE.violet,
} satisfies Record<Exclude<BuiltInOutputStyle, 'Default'>, string>

// Solid colors keyed by row, then by value. Keyed off QuickSettingField so a row added to the
// descriptor table fails to compile until it says how its values are colored — and each row's map
// is keyed off that row's own candidate ring, so a value added to a ring fails to compile too.
// `undefined` is how a value says it renders in the default text color on purpose.
const QUICK_SETTING_COLORS: Record<QuickSettingField, Record<string, string | undefined>> = {
  defaultMode: {
    // The neutral starting mode, left uncolored so the modes that loosen permissions stand out.
    manual: undefined,
    acceptEdits: PALETTE.green,
    plan: PALETTE.cyan,
    auto: PALETTE.amber,
    dontAsk: PALETTE.red,
    bypassPermissions: PALETTE.red,
  } satisfies Record<PermissionDefaultMode, string | undefined>,
  effortLevel: {
    low: PALETTE.amber,
    medium: PALETTE.green,
    high: PALETTE.violet,
    // The top three are animated below instead of taking a solid color.
    xhigh: undefined,
    max: undefined,
    ultracode: undefined,
  } satisfies Record<EffortLevel, string | undefined>,
  outputStyle: OUTPUT_STYLE_COLORS,
}

const XHIGH_BASE = PALETTE.green
const XHIGH_HIGHLIGHT = PALETTE.violet
const ULTRACODE_BACKGROUND = PALETTE.ultracode
const SCROLL_INTERVAL_MS = 150

const RAINBOW_PALETTE = [
  PALETTE.red,
  PALETTE.amber,
  PALETTE.yellow,
  PALETTE.green,
  PALETTE.cyan,
  PALETTE.blue,
  PALETTE.violet,
]

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

function ColoredValue({ colors, value }: { colors: Record<string, string | undefined>; value: string }) {
  const color = colors[value]
  return color ? <Text color={color}>{value}</Text> : <Text>{value}</Text>
}

export function QuickSettingValue({ field, value }: { field: QuickSettingField; value: string }) {
  // The top effort levels animate instead of taking a solid color, which is what sets them apart
  // from the levels Claude Code applies without a launch arg.
  if (field === 'effortLevel') {
    if (value === 'xhigh') return <AnimatedText text={value} colorAt={sweepColorAt(value.length)} />
    if (value === 'max') return <AnimatedText text={value} colorAt={rainbowColorAt} />
    if (value === 'ultracode') return <Text backgroundColor={ULTRACODE_BACKGROUND} color="white">{value}</Text>
  }

  return <ColoredValue colors={QUICK_SETTING_COLORS[field]} value={value} />
}
