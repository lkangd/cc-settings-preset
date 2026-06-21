import { useCallback, useRef, useState } from 'react'
import type { Key } from 'ink'
import type { LaunchPresetMeta } from '../core/schema.js'
import type {
  DisableRemovalMark,
  ProjectLaunchFlowState,
  ProjectLaunchPresetItem,
  ProjectLaunchToggleState,
} from '../flows/project-launch-flow.js'
import {
  annotateToggleItems,
  createProjectLaunchFlowState,
  formatProjectLaunchSortMode,
  getActiveProjectLaunchItem,
  getActiveProjectLaunchState,
  getPendingDisableRemovals,
  reduceProjectLaunchFlow,
  shouldBubbleProjectLaunchEscape,
} from '../flows/project-launch-flow.js'
import type { DisableLockSource } from '../services/disable-lock-service.js'
import type { ProjectLaunchColumnsViewProps } from './components/project-launch-columns-view.js'

export type ProjectLaunchBrowserKey = Partial<Key>

export type ProjectLaunchBrowserDispatchResult = {
  handled: boolean
  bubbledEscape?: boolean
  toggledDetected?: boolean
}

type UseProjectLaunchBrowserControllerInput = {
  presets: LaunchPresetMeta[]
  detected: ProjectLaunchToggleState
  statesByPreset: Record<string, ProjectLaunchToggleState>
  disableLockSources?: DisableLockSource[]
  lastUsedName?: string
  moveRightWithL?: boolean
  title?: string
  help?: string
}

export type ProjectLaunchBrowserController = {
  state: ProjectLaunchFlowState
  activeItem: ProjectLaunchPresetItem | undefined
  activeToggleState: ProjectLaunchToggleState
  sortMessage: string | null
  columnsProps: ProjectLaunchColumnsViewProps
  dispatchBrowserKey: (input: string, key: ProjectLaunchBrowserKey) => ProjectLaunchBrowserDispatchResult
  confirmEnableUnlock: () => void
  cancelEnableUnlock: () => void
  disableRemovalsProps: () => { disableRemovals?: DisableRemovalMark[] }
  syncPresetState: (updater: (state: ProjectLaunchFlowState) => ProjectLaunchFlowState) => void
}

export function useProjectLaunchBrowserController({
  presets,
  detected,
  statesByPreset,
  disableLockSources = [],
  lastUsedName,
  moveRightWithL = true,
  title,
  help,
}: UseProjectLaunchBrowserControllerInput): ProjectLaunchBrowserController {
  const [state, setState] = useState(() =>
    createProjectLaunchFlowState({
      presets,
      detected,
      statesByPreset,
      disableLockSources,
      ...(lastUsedName ? { lastUsedName } : {}),
    })
  )
  // Multiple dispatches can happen before React renders; mirror state in refs so each dispatch sees the latest synchronous flow state.
  const stateRef = useRef(state)
  stateRef.current = state
  const [sortMessage, setSortMessageState] = useState<string | null>(null)
  const sortMessageRef = useRef(sortMessage)
  sortMessageRef.current = sortMessage

  const detectedBaseline = state.statesByPreset.Detected ?? detected
  const activeItem = getActiveProjectLaunchItem(state)
  const activeToggleState = getActiveProjectLaunchState(state)

  const pluginItems = annotateToggleItems(state, detectedBaseline, 'plugins', state.plugins)
  const skillItems = annotateToggleItems(state, detectedBaseline, 'skills', state.skills)
  const mcpItems = annotateToggleItems(state, detectedBaseline, 'mcps', state.mcps)

  const message = state.toggleMessage ?? sortMessage
  const columnsProps: ProjectLaunchColumnsViewProps = {
    presetItems: state.presetItems,
    presetCursor: state.presetCursor,
    focus: state.focus,
    plugins: state.plugins,
    pluginItems,
    pluginCursor: state.pluginCursor,
    skills: state.skills,
    skillItems,
    skillCursor: state.skillCursor,
    mcps: state.mcps,
    mcpItems,
    mcpCursor: state.mcpCursor,
    ...(title ? { title } : {}),
    ...(help ? { help } : {}),
    ...(message ? { toggleMessage: message } : {}),
  }

  const updateFlowState = useCallback((updater: (current: ProjectLaunchFlowState) => ProjectLaunchFlowState): ProjectLaunchFlowState => {
    const nextState = updater(stateRef.current)
    stateRef.current = nextState
    setState(nextState)
    return nextState
  }, [])

  const reduceCurrentFlow = useCallback((event: Parameters<typeof reduceProjectLaunchFlow>[1]): ProjectLaunchFlowState => {
    return updateFlowState(current => reduceProjectLaunchFlow(current, event))
  }, [updateFlowState])

  const updateSortMessage = useCallback((nextMessage: string | null): void => {
    sortMessageRef.current = nextMessage
    setSortMessageState(nextMessage)
  }, [])

  const dispatchBrowserKey = useCallback((input: string, key: ProjectLaunchBrowserKey): ProjectLaunchBrowserDispatchResult => {
    if (stateRef.current.pendingEnableUnlock) return { handled: true }
    if (input !== 't' && sortMessageRef.current) updateSortMessage(null)

    if (key.leftArrow || input === 'h') {
      reduceCurrentFlow({ type: 'focus-left' })
      return { handled: true }
    }

    if (key.rightArrow || (moveRightWithL && input === 'l' && !key.ctrl && !key.meta)) {
      reduceCurrentFlow({ type: 'focus-right' })
      return { handled: true }
    }

    if (key.upArrow || input === 'k') {
      reduceCurrentFlow({ type: 'up' })
      return { handled: true }
    }

    if (key.downArrow || input === 'j') {
      reduceCurrentFlow({ type: 'down' })
      return { handled: true }
    }

    if (key.escape) {
      if (shouldBubbleProjectLaunchEscape(stateRef.current)) return { handled: true, bubbledEscape: true }
      reduceCurrentFlow({ type: 'escape' })
      return { handled: true }
    }

    if (input === 't') {
      const nextState = reduceCurrentFlow({ type: 'toggle-sort-mode' })
      updateSortMessage(formatProjectLaunchSortMode(nextState.sortMode))
      return { handled: true }
    }

    if (input === ' ') {
      const toggledDetected = stateRef.current.focus === 'presets' && getActiveProjectLaunchItem(stateRef.current)?.type === 'detected'
      reduceCurrentFlow({ type: 'toggle-current' })
      return { handled: true, ...(toggledDetected ? { toggledDetected } : {}) }
    }

    return { handled: false }
  }, [moveRightWithL, reduceCurrentFlow, updateSortMessage])

  const confirmEnableUnlock = useCallback(() => {
    reduceCurrentFlow({ type: 'confirm-enable-unlock' })
  }, [reduceCurrentFlow])

  const cancelEnableUnlock = useCallback(() => {
    reduceCurrentFlow({ type: 'cancel-enable-unlock' })
  }, [reduceCurrentFlow])

  const disableRemovalsProps = useCallback(() => {
    const pendingDisableRemovals = getPendingDisableRemovals(stateRef.current)
    return pendingDisableRemovals.length > 0 ? { disableRemovals: pendingDisableRemovals } : {}
  }, [])

  const syncPresetState = useCallback((updater: (state: ProjectLaunchFlowState) => ProjectLaunchFlowState) => {
    updateFlowState(updater)
  }, [updateFlowState])

  return {
    state,
    activeItem,
    activeToggleState,
    sortMessage,
    columnsProps,
    dispatchBrowserKey,
    confirmEnableUnlock,
    cancelEnableUnlock,
    disableRemovalsProps,
    syncPresetState,
  }
}
