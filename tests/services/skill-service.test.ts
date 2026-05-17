import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverSkillStates } from '../../src/services/skill-service.js'

describe('discoverSkillStates', () => {
  it('discovers user, project, command-backed, and plugin skills', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-skills-'))
    const home = join(root, 'home')
    const cwd = join(root, 'repo')
    const pluginCache = join(home, '.claude', 'plugins', 'cache', 'market', 'demo-plugin')

    await mkdir(join(home, '.claude', 'skills', 'personal'), { recursive: true })
    await mkdir(join(cwd, '.claude', 'skills', 'project'), { recursive: true })
    await mkdir(join(cwd, '.claude', 'commands'), { recursive: true })
    await mkdir(join(pluginCache, 'skills', 'plugin-skill'), { recursive: true })

    await writeFile(join(home, '.claude', 'skills', 'personal', 'SKILL.md'), '---\nname: personal\n---\n')
    await writeFile(join(cwd, '.claude', 'skills', 'project', 'SKILL.md'), '---\nname: project\n---\n')
    await writeFile(join(cwd, '.claude', 'commands', 'deploy.md'), '# deploy')
    await writeFile(join(pluginCache, 'plugin.json'), '{"name":"demo-plugin"}')
    await writeFile(join(pluginCache, 'skills', 'plugin-skill', 'SKILL.md'), '---\nname: plugin-skill\n---\n')

    const skills = await discoverSkillStates({
      homeDir: home,
      cwd,
      enabledPlugins: { 'demo-plugin': true },
      skillOverrides: { personal: 'off' },
    })

    expect(skills.map(skill => skill.name)).toEqual(['deploy', 'demo-plugin:plugin-skill', 'personal', 'project'])
    expect(skills.find(skill => skill.name === 'personal')?.enabled).toBe(false)
    expect(skills.find(skill => skill.name === 'demo-plugin:plugin-skill')?.toggleable).toBe(false)
  })
})
