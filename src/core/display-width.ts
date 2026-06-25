const emojiRegex = /\p{Extended_Pictographic}/u
const combiningMarkRegex = /\p{Mark}/u

const graphemeSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  : undefined

function splitGraphemes(value: string): string[] {
  if (!graphemeSegmenter) return Array.from(value)
  return Array.from(graphemeSegmenter.segment(value), item => item.segment)
}

function isWideCodePoint(codePoint: number): boolean {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1f64f) ||
    (codePoint >= 0x1f900 && codePoint <= 0x1f9ff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  )
}

function measureGraphemeWidth(grapheme: string): number {
  if (!grapheme) return 0
  if (emojiRegex.test(grapheme)) return 2

  let width = 0
  for (const char of Array.from(grapheme)) {
    const codePoint = char.codePointAt(0)
    if (codePoint === undefined) continue
    if (combiningMarkRegex.test(char) || codePoint === 0x200d || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)) continue
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) continue
    width = Math.max(width, isWideCodePoint(codePoint) ? 2 : 1)
  }

  return width
}

export function measureDisplayWidth(value: string): number {
  return splitGraphemes(value).reduce((sum, grapheme) => sum + measureGraphemeWidth(grapheme), 0)
}

export function truncateToDisplayWidth(value: string, maxWidth: number): string {
  if (maxWidth <= 0) return ''

  let output = ''
  let width = 0
  for (const grapheme of splitGraphemes(value)) {
    const graphemeWidth = measureGraphemeWidth(grapheme)
    if (width + graphemeWidth > maxWidth) break
    output += grapheme
    width += graphemeWidth
  }

  return output
}
