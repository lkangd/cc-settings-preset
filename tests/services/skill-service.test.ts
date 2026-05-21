import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applySkillOverrides, discoverSkillStates, resolveSkillOverrides } from '../../src/services/skill-service.js'

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
    })

    expect(skills.map(skill => skill.name)).toEqual(['deploy', 'demo-plugin:plugin-skill', 'personal', 'project'])
    expect(skills.find(skill => skill.name === 'personal')?.enabled).toBe(true)
    expect(skills.find(skill => skill.name === 'demo-plugin:plugin-skill')?.toggleable).toBe(false)
  })

  it('applies preset skill overrides to discovered non-plugin skills', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-skill-overrides-'))
    const home = join(root, 'home')
    const cwd = join(root, 'repo')
    const pluginCache = join(home, '.claude', 'plugins', 'cache', 'market', 'demo-plugin')

    await mkdir(join(home, '.claude', 'skills', 'personal'), { recursive: true })
    await mkdir(join(cwd, '.claude', 'skills', 'project'), { recursive: true })
    await mkdir(join(pluginCache, 'skills', 'plugin-skill'), { recursive: true })

    await writeFile(join(home, '.claude', 'skills', 'personal', 'SKILL.md'), '---\nname: personal\n---\n')
    await writeFile(join(cwd, '.claude', 'skills', 'project', 'SKILL.md'), '---\nname: project\n---\n')
    await writeFile(join(pluginCache, 'plugin.json'), '{"name":"demo-plugin"}')
    await writeFile(join(pluginCache, 'skills', 'plugin-skill', 'SKILL.md'), '---\nname: plugin-skill\n---\n')

    const skills = await discoverSkillStates({
      homeDir: home,
      cwd,
      enabledPlugins: { 'demo-plugin': true },
    })

    const resolved = applySkillOverrides(skills, {
      personal: 'off',
      project: 'off',
      'demo-plugin:plugin-skill': 'off',
    })

    expect(resolved.find(skill => skill.name === 'personal')?.enabled).toBe(false)
    expect(resolved.find(skill => skill.name === 'project')?.enabled).toBe(false)
    expect(resolved.find(skill => skill.name === 'demo-plugin:plugin-skill')?.enabled).toBe(true)
  })

  it('discovers user skills exposed as symlinks to directories', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ccsp-symlink-skills-'))
    const home = join(root, 'home')
    const cwd = join(root, 'repo')
    const realSkillDir = join(root, 'shared-skills', 'context7-mcp')
    const linkedSkillDir = join(home, '.claude', 'skills', 'context7-mcp')

    await mkdir(realSkillDir, { recursive: true })
    await mkdir(join(home, '.claude', 'skills'), { recursive: true })
    await writeFile(join(realSkillDir, 'SKILL.md'), '---\nname: context7-mcp\n---\n')
    await symlink(realSkillDir, linkedSkillDir)

    const skills = await discoverSkillStates({
      homeDir: home,
      cwd,
      enabledPlugins: {},
    })

    expect(skills.map(skill => skill.name)).toContain('context7-mcp')
  })
})

describe('resolveSkillOverrides', () => {
  it('uses higher-priority settings sources to override lower-priority ones', () => {
    expect(resolveSkillOverrides([
      { scope: 'project-local', settings: { skillOverrides: { personal: 'off', shared: 'name-only' } } },
      { scope: 'project', settings: { skillOverrides: { shared: 'off' } } },
      { scope: 'user', settings: { skillOverrides: { personal: 'on' } } },
    ])).toEqual({
      personal: 'off',
      shared: 'name-only',
    })
  })
})
