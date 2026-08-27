import { promises as fs, type Dirent } from 'node:fs'
import { join } from 'node:path'

import { readDirSafe } from '../core/fs.js'
import { resolveUserOutputStylesDir } from '../core/paths.js'

// Only the leading `---` block, and only when it is closed: an unterminated block is not
// frontmatter, and scanning past it would pick up a body line that merely starts with `name:`.
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

// Not a YAML parser — just the two scalar forms a style name realistically takes. A quoted scalar
// keeps its contents verbatim (a `#` inside quotes is part of the name); an unquoted one ends at an
// inline comment. Anything more exotic is passed through as written.
function normalizeFrontmatterName(raw: string): string | undefined {
  const value = raw.trim()
  const quoted = /^(['"])(.*)\1$/.exec(value)
  const name = quoted ? quoted[2]!.trim() : value.split(/\s+#/)[0]!.trim()
  return name.length > 0 ? name : undefined
}

// Claude Code resolves an output style file to its frontmatter `name`, falling back to the file
// name. Reading only the file name would write a value Claude Code does not recognize, which fails
// silently: the preset shows a style, the session runs without one.
function readFrontmatterName(content: string): string | undefined {
  // A leading BOM would otherwise keep the block regex from matching at all.
  const body = content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content
  const block = FRONTMATTER_BLOCK.exec(body)
  if (!block) return undefined

  for (const line of block[1]!.split(/\r?\n/)) {
    const match = /^name:\s*(.+)$/.exec(line)
    if (match) return normalizeFrontmatterName(match[1]!)
  }
  return undefined
}

// Symlinked style files are normal in dotfiles setups and Claude Code loads them, so follow the
// link rather than dropping them the way a bare `isFile()` would (see preset-service.ts:123).
async function isMarkdownFile(dirPath: string, entry: Dirent): Promise<boolean> {
  if (!entry.name.endsWith('.md')) return false
  if (entry.isFile()) return true
  if (!entry.isSymbolicLink()) return false

  try {
    return (await fs.stat(join(dirPath, entry.name))).isFile()
  } catch {
    return false
  }
}

// User-level output styles only. Project and plugin styles are deliberately left out: the base
// preset selector runs before a project is chosen, so a project style would produce a preset value
// that stops resolving the moment the same preset is used elsewhere.
export async function discoverUserOutputStyles(homeDir: string): Promise<string[]> {
  const dirPath = resolveUserOutputStylesDir(homeDir)

  let entries: Dirent[]
  try {
    entries = await readDirSafe(dirPath)
  } catch {
    return []
  }

  const isMarkdown = await Promise.all(entries.map(entry => isMarkdownFile(dirPath, entry)))
  const fileNames = entries
    .filter((_, index) => isMarkdown[index])
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b))

  const names = await Promise.all(fileNames.map(async fileName => {
    let content = ''
    try {
      content = await fs.readFile(join(dirPath, fileName), 'utf8')
    } catch {
      // An unreadable style file still exists as a selectable style, so keep the file-name form.
    }
    return readFrontmatterName(content) ?? fileName.slice(0, -'.md'.length)
  }))

  // A file named exactly `.md` would otherwise contribute an empty candidate, which cycles into the
  // preset as `"outputStyle": ""` and then reads back as unset — a key the user cannot see or clear.
  return [...new Set(names.filter(name => name.trim().length > 0))]
}
