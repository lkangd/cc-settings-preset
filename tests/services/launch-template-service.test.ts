import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  resolveGlobalLaunchTemplateIndexPath,
  resolveGlobalLaunchTemplatePath,
} from '../../src/core/paths.js'
import type { PresetOrigin } from '../../src/core/schema.js'
import { createLaunchTemplateService } from '../../src/services/launch-template-service.js'

function origin(name: string, path = '/projects/web'): PresetOrigin {
  return { kind: 'project', name, path, at: '2026-08-13T00:00:00.000Z' }
}

async function createGlobalRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ccsp-global-'))
}

describe('launch template service', () => {
  it('promotes a project preset into a global template', async () => {
    const globalRoot = await createGlobalRoot()
    const service = createLaunchTemplateService(globalRoot)

    const meta = await service.promote('web-dev', { enabledPlugins: { alpha: false } }, origin('web-dev'))

    expect(meta.name).toBe('web-dev')
    expect(meta.fileName).toBe('web-dev-launch.json')
    expect(await service.readTemplateSettings('web-dev')).toEqual({ enabledPlugins: { alpha: false } })
    expect((await service.listTemplates()).map(template => template.name)).toEqual(['web-dev'])
  })

  it('records where a template came from', async () => {
    const globalRoot = await createGlobalRoot()
    const service = createLaunchTemplateService(globalRoot)

    await service.promote('web-dev', {}, origin('web-dev', '/projects/web'))

    const [template] = await service.listTemplates()
    expect(template?.origin).toEqual({
      kind: 'project',
      name: 'web-dev',
      path: '/projects/web',
      at: '2026-08-13T00:00:00.000Z',
    })
  })

  it('reports a conflict instead of silently replacing an existing template', async () => {
    const globalRoot = await createGlobalRoot()
    const service = createLaunchTemplateService(globalRoot)

    await service.promote('web-dev', { enabledPlugins: { alpha: false } }, origin('web-dev'))

    await expect(service.promote('web-dev', {}, origin('web-dev')))
      .rejects.toThrow('Launch template already exists: web-dev')
    expect(await service.readTemplateSettings('web-dev')).toEqual({ enabledPlugins: { alpha: false } })
  })

  it('overwrites an existing template only when asked to', async () => {
    const globalRoot = await createGlobalRoot()
    const service = createLaunchTemplateService(globalRoot)

    await service.promote('web-dev', { enabledPlugins: { alpha: false } }, origin('web-dev'))
    await service.overwrite('web-dev', { enabledPlugins: { beta: false } }, origin('web-dev', '/projects/api'))

    expect(await service.readTemplateSettings('web-dev')).toEqual({ enabledPlugins: { beta: false } })
    const [template] = await service.listTemplates()
    expect(template?.origin?.path).toBe('/projects/api')
  })

  it('renames and deletes templates', async () => {
    const globalRoot = await createGlobalRoot()
    const service = createLaunchTemplateService(globalRoot)

    await service.promote('web-dev', {}, origin('web-dev'))
    const renamed = await service.renameTemplate('web-dev', 'frontend')

    expect(renamed.name).toBe('frontend')
    expect((await service.listTemplates()).map(template => template.name)).toEqual(['frontend'])

    await service.deleteTemplate('frontend')
    expect(await service.listTemplates()).toEqual([])
  })

  it('keeps templates out of the base preset directory', async () => {
    const globalRoot = await createGlobalRoot()
    const service = createLaunchTemplateService(globalRoot)

    await service.promote('web-dev', {}, origin('web-dev'))

    const index = JSON.parse(await readFile(resolveGlobalLaunchTemplateIndexPath(globalRoot), 'utf8'))
    expect(Object.keys(index.presets)).toEqual(['web-dev'])
    expect(resolveGlobalLaunchTemplateIndexPath(globalRoot)).toContain(join('launch-presets', 'index.json'))
  })

  it('lists the templates it can read when one of them is broken', async () => {
    const globalRoot = await createGlobalRoot()
    const service = createLaunchTemplateService(globalRoot)

    await service.promote('web-dev', { enabledPlugins: { alpha: false } }, origin('web-dev'))
    await service.promote('broken', {}, origin('broken'))
    await writeFile(resolveGlobalLaunchTemplatePath(globalRoot, 'broken-launch.json'), '{ not json', 'utf8')

    const entries = await service.listTemplatesWithSettings()
    expect(entries.map(entry => entry.meta.name)).toEqual(['web-dev'])
  })

  it('refuses to touch a file the index points at outside the template directory', async () => {
    const globalRoot = await createGlobalRoot()
    const outside = join(globalRoot, 'settings', 'secret.json')
    await mkdir(dirname(outside), { recursive: true })
    await writeFile(outside, '{}', 'utf8')

    await createLaunchTemplateService(globalRoot).promote('escape', {}, origin('escape'))
    const indexPath = resolveGlobalLaunchTemplateIndexPath(globalRoot)
    const index = JSON.parse(await readFile(indexPath, 'utf8'))
    index.presets.escape.fileName = join('..', 'settings', 'secret.json')
    await writeFile(indexPath, JSON.stringify(index), 'utf8')

    const service = createLaunchTemplateService(globalRoot)
    await expect(service.readTemplateSettings('escape')).rejects.toThrow('invalid file name')
    await expect(service.deleteTemplate('escape')).rejects.toThrow('invalid file name')
    expect(await readFile(outside, 'utf8')).toBe('{}')
  })
})
