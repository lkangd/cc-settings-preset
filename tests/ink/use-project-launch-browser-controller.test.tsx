import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { describe, expect, it } from 'vitest'
import type { ProjectLaunchToggleState } from '../../src/flows/project-launch-flow.js'
import type { DisableLockSource } from '../../src/services/disable-lock-service.js'
import {
  type ProjectLaunchBrowserController,
  useProjectLaunchBrowserController,
} from '../../src/ink/use-project-launch-browser-controller.js'

const detected: ProjectLaunchToggleState = {
  plugins: [{ name: 'alpha', enabled: true, source: 'user' }],
  skills: [{ name: 'personal', enabled: true, source: 'user', toggleable: true }],
  mcps: [{ name: 'github', enabled: true, source: 'project', config: {} }],
}

function renderController(input?: {
  detected?: ProjectLaunchToggleState
  statesByPreset?: Record<string, ProjectLaunchToggleState>
  disableLockSources?: DisableLockSource[]
  moveRightWithL?: boolean
}) {
  let controller: ProjectLaunchBrowserController | undefined

  function Probe() {
    controller = useProjectLaunchBrowserController({
      presets: [],
      detected: input?.detected ?? detected,
      statesByPreset: input?.statesByPreset ?? {},
      disableLockSources: input?.disableLockSources ?? [],
      moveRightWithL: input?.moveRightWithL ?? true,
    })
    return React.createElement('probe')
  }

  act(() => {
    TestRenderer.create(<Probe />)
  })

  return () => controller!
}

function renderLockedPluginController() {
  return renderController({
    detected: {
      plugins: [{ name: 'alpha', enabled: false, source: 'project-local' }],
      skills: [],
      mcps: [],
    },
    statesByPreset: {},
    disableLockSources: [
      {
        scope: 'project-local',
        filePath: '/tmp/settings.local.json',
        settings: { enabledPlugins: { alpha: false } },
      },
    ],
  })
}

describe('useProjectLaunchBrowserController', () => {
  it('moves focus with shared browser keys', () => {
    const current = renderController()

    act(() => {
      current().dispatchBrowserKey('', { rightArrow: true })
    })

    expect(current().state.focus).toBe('plugins')

    act(() => {
      current().dispatchBrowserKey('l', {})
    })

    expect(current().state.focus).toBe('skills')

    act(() => {
      current().dispatchBrowserKey('h', {})
    })

    expect(current().state.focus).toBe('plugins')
  })

  it('can reserve l for manage launch instead of moving focus right', () => {
    const current = renderController({ moveRightWithL: false })

    act(() => {
      current().dispatchBrowserKey('l', {})
    })

    expect(current().state.focus).toBe('presets')
  })

  it('updates sort message when sorting and clears it on the next non-sort browser key', () => {
    const current = renderController()

    act(() => {
      current().dispatchBrowserKey('t', {})
    })

    expect(current().sortMessage).toBe('Sorted by name')

    act(() => {
      current().dispatchBrowserKey('j', {})
    })

    expect(current().sortMessage).toBeNull()
  })

  it('clears sort message when sort and non-sort keys dispatch in the same batch', () => {
    const current = renderController()

    act(() => {
      current().dispatchBrowserKey('t', {})
      current().dispatchBrowserKey('j', {})
    })

    expect(current().sortMessage).toBeNull()
  })

  it('keeps returned action references stable across browser-only rerenders', () => {
    const current = renderController()
    const actions = {
      dispatchBrowserKey: current().dispatchBrowserKey,
      confirmEnableUnlock: current().confirmEnableUnlock,
      cancelEnableUnlock: current().cancelEnableUnlock,
      disableRemovalsProps: current().disableRemovalsProps,
      syncPresetState: current().syncPresetState,
    }

    act(() => {
      current().dispatchBrowserKey('t', {})
    })

    expect(current().dispatchBrowserKey).toBe(actions.dispatchBrowserKey)
    expect(current().confirmEnableUnlock).toBe(actions.confirmEnableUnlock)
    expect(current().cancelEnableUnlock).toBe(actions.cancelEnableUnlock)
    expect(current().disableRemovalsProps).toBe(actions.disableRemovalsProps)
    expect(current().syncPresetState).toBe(actions.syncPresetState)
  })

  it('dispatches consecutive browser keys against the latest state in one batch', () => {
    const escapeCurrent = renderController()
    let escapeResult: ReturnType<ProjectLaunchBrowserController['dispatchBrowserKey']> | undefined

    act(() => {
      escapeCurrent().dispatchBrowserKey('', { rightArrow: true })
      escapeResult = escapeCurrent().dispatchBrowserKey('', { escape: true })
    })

    expect(escapeResult).toEqual({ handled: true })
    expect(escapeCurrent().state.focus).toBe('presets')

    const spaceCurrent = renderController()
    let spaceResult: ReturnType<ProjectLaunchBrowserController['dispatchBrowserKey']> | undefined

    act(() => {
      spaceCurrent().dispatchBrowserKey('', { rightArrow: true })
      spaceResult = spaceCurrent().dispatchBrowserKey(' ', {})
    })

    expect(spaceResult).toEqual({ handled: true })
    expect(spaceCurrent().state.plugins[0]?.enabled).toBe(false)

    const sortCurrent = renderController()

    act(() => {
      sortCurrent().dispatchBrowserKey('t', {})
      sortCurrent().dispatchBrowserKey('t', {})
    })

    expect(sortCurrent().sortMessage).toBe('Sorted by status')
    expect(sortCurrent().state.sortMode).toBe('status')
  })

  it('returns active state, disable removal props, and annotated column props', () => {
    const current = renderController()

    expect(current().activeToggleState).toEqual(detected)
    expect(current().disableRemovalsProps()).toEqual({})
    expect(current().columnsProps.presetItems).toHaveLength(1)
    expect(current().columnsProps.pluginItems).toEqual([
      { name: 'alpha', enabled: true, source: 'user', enableLocked: false },
    ])
  })

  it('requests and confirms enable unlock through the shared controller', () => {
    const current = renderLockedPluginController()

    act(() => {
      current().dispatchBrowserKey('', { rightArrow: true })
    })
    act(() => {
      current().dispatchBrowserKey(' ', {})
    })

    expect(current().state.pendingEnableUnlock).toEqual({
      kind: 'plugins',
      name: 'alpha',
      filePath: '/tmp/settings.local.json',
    })

    act(() => {
      current().confirmEnableUnlock()
    })

    expect(current().state.plugins[0]?.enabled).toBe(true)
    expect(current().disableRemovalsProps()).toEqual({
      disableRemovals: [{ kind: 'plugins', name: 'alpha', filePath: '/tmp/settings.local.json' }],
    })
  })

  it('gates ordinary browser keys while enable unlock is pending', () => {
    const current = renderLockedPluginController()

    act(() => {
      current().dispatchBrowserKey('', { rightArrow: true })
    })
    act(() => {
      current().dispatchBrowserKey(' ', {})
    })
    let blockedResult: ReturnType<ProjectLaunchBrowserController['dispatchBrowserKey']> | undefined
    act(() => {
      blockedResult = current().dispatchBrowserKey('j', {})
    })

    expect(blockedResult).toEqual({ handled: true })
    expect(current().state.focus).toBe('plugins')
    expect(current().state.pendingEnableUnlock?.name).toBe('alpha')
  })

  it('cancels pending enable unlock without changing toggles', () => {
    const current = renderLockedPluginController()

    act(() => {
      current().dispatchBrowserKey('', { rightArrow: true })
    })
    act(() => {
      current().dispatchBrowserKey(' ', {})
    })
    act(() => {
      current().cancelEnableUnlock()
    })

    expect(current().state.pendingEnableUnlock).toBeUndefined()
    expect(current().state.plugins[0]?.enabled).toBe(false)
    expect(current().disableRemovalsProps()).toEqual({})
  })

  it('reports bubbled escape without mutating focused presets state', () => {
    const current = renderController()

    const result = current().dispatchBrowserKey('', { escape: true })

    expect(result).toEqual({ handled: true, bubbledEscape: true })
    expect(current().state.focus).toBe('presets')
  })
})
