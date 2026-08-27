import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverUserOutputStyles } from '../../src/services/output-style-service.js'

async function createHomeWithStyles(files: Record<string, string>): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'ccsp-output-styles-'))
  const stylesDir = join(home, '.claude', 'output-styles')
  await mkdir(stylesDir, { recursive: true })
  for (const [fileName, content] of Object.entries(files)) {
    await writeFile(join(stylesDir, fileName), content)
  }
  return home
}

describe('discoverUserOutputStyles', () => {
  it('prefers the frontmatter name and falls back to the file name', async () => {
    const home = await createHomeWithStyles({
      'diagrams.md': '---\nname: Diagrams first\ndescription: Lead with a diagram\n---\n\nDraw it.\n',
      'quoted.md': "---\nname: 'Quoted Style'\n---\n",
      'plain.md': 'No frontmatter at all.\n',
      'empty-name.md': '---\nname:\ndescription: nothing\n---\n',
      'after-close.md': '---\ndescription: only a description\n---\n\nname: not frontmatter\n',
    })

    expect(await discoverUserOutputStyles(home)).toEqual([
      'after-close',
      'Diagrams first',
      'empty-name',
      'plain',
      'Quoted Style',
    ])
  })

  it('ignores non-markdown entries and directories', async () => {
    const home = await createHomeWithStyles({ 'real.md': '# real', 'notes.txt': 'ignored' })
    await mkdir(join(home, '.claude', 'output-styles', 'nested.md'), { recursive: true })

    expect(await discoverUserOutputStyles(home)).toEqual(['real'])
  })

  it('returns nothing when the directory does not exist', async () => {
    const home = await mkdtemp(join(tmpdir(), 'ccsp-output-styles-missing-'))

    expect(await discoverUserOutputStyles(home)).toEqual([])
  })

  it('stops at the closing delimiter instead of reading a name out of the body', async () => {
    const home = await createHomeWithStyles({
      // No closing `---`: this is not frontmatter, so the body's `name:` must not become the style.
      'unclosed.md': '---\ndescription: never closed\n\nname: from the body\n',
      'bom.md': '﻿---\nname: After BOM\n---\n',
    })

    expect(await discoverUserOutputStyles(home)).toEqual(['After BOM', 'unclosed'])
  })

  it('reads the name as YAML would, dropping an inline comment but keeping a quoted hash', async () => {
    const home = await createHomeWithStyles({
      'commented.md': '---\nname: Diagrams first # keep this out of the name\n---\n',
      'hashed.md': '---\nname: "C# helper"\n---\n',
    })

    expect(await discoverUserOutputStyles(home)).toEqual(['Diagrams first', 'C# helper'])
  })

  it('follows symlinked style files the way Claude Code does', async () => {
    const home = await createHomeWithStyles({ 'real.md': '---\nname: Real\n---\n' })
    const stylesDir = join(home, '.claude', 'output-styles')
    await writeFile(join(home, 'external.md'), '---\nname: Linked\n---\n')
    await symlink(join(home, 'external.md'), join(stylesDir, 'linked.md'))

    expect((await discoverUserOutputStyles(home)).sort()).toEqual(['Linked', 'Real'])
  })

  it('drops an empty candidate that would persist as an invisible outputStyle key', async () => {
    const home = await createHomeWithStyles({ '.md': 'no name anywhere', 'real.md': '# real' })

    expect(await discoverUserOutputStyles(home)).toEqual(['real'])
  })

  it('drops duplicate names so the same style is never offered twice', async () => {
    const home = await createHomeWithStyles({
      'a.md': '---\nname: Shared\n---\n',
      'b.md': '---\nname: Shared\n---\n',
    })

    expect(await discoverUserOutputStyles(home)).toEqual(['Shared'])
  })
})
