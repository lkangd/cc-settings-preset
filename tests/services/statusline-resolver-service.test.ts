import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveEffectiveStatusLine } from '../../src/services/statusline-resolver-service.js'

const readManagedSettingsMock = vi.hoisted(() => vi.fn())

vi.mock('../../src/services/managed-settings-service.js', () => ({
  readManagedSettings: readManagedSettingsMock,
}))

describe('resolveEffectiveStatusLine', () => {
  beforeEach(() => {
    readManagedSettingsMock.mockReset()
    readManagedSettingsMock.mockResolvedValue(undefined)
  })

  it('prefers managed statusLine over project-local, project, user, and base', async () => {
    readManagedSettingsMock.mockResolvedValue({
      statusLine: { type: 'command', command: 'override' },
    })
    const resolved = await resolveEffectiveStatusLine({
      claudeSources: [
        {
          scope: 'project-local',
          filePath: '/tmp/.claude/settings.local.json',
          settings: { statusLine: { type: 'command', command: 'local' } },
        },
        {
          scope: 'project',
          filePath: '/tmp/.claude/settings.json',
          settings: { statusLine: { type: 'command', command: 'project' } },
        },
        {
          scope: 'user',
          filePath: '/tmp/.claude/settings.json',
          settings: { statusLine: { type: 'command', command: 'user' } },
        },
      ],
      baseSettings: { statusLine: { type: 'command', command: 'base' } },
    })

    expect(resolved).toEqual({
      scope: 'managed',
      config: { type: 'command', command: 'override' },
    })
  })

  it('falls back through claude scopes before base preset', async () => {
    const resolved = await resolveEffectiveStatusLine({
      claudeSources: [
        {
          scope: 'project',
          filePath: '/tmp/.claude/settings.json',
          settings: { statusLine: { type: 'command', command: 'project' } },
        },
        {
          scope: 'user',
          filePath: '/tmp/.claude/settings.json',
          settings: { statusLine: { type: 'command', command: 'user' } },
        },
      ],
      baseSettings: { statusLine: { type: 'command', command: 'base' } },
    })

    expect(resolved).toEqual({
      scope: 'project',
      config: { type: 'command', command: 'project' },
    })
  })

  it('returns undefined when no layer defines statusLine', async () => {
    await expect(resolveEffectiveStatusLine({
      claudeSources: [
        { scope: 'user', filePath: '/tmp/settings.json', settings: { permissions: { allow: ['Read(*)'] } } },
      ],
      baseSettings: { permissions: { allow: ['Bash(*)'] } },
    })).resolves.toBeUndefined()
  })
})
