import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeJsonFile } from '../core/json.js'
import { resolveGlobalRoot } from '../core/paths.js'
import { compareVersions, resolveLatestVersion } from './update-service.js'
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000

type UpdateCheckCache = {
  latestVersion: string
  checkedAt: string
}

type UpdateCheckServiceOptions = {
  homeDir: string
  currentVersion: string
  fetchText?: (url: string) => Promise<string>
  now?: () => Date
  ttlMs?: number
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  return response.text()
}

function parseCache(value: unknown): UpdateCheckCache | undefined {
  if (!value || typeof value !== 'object') return undefined
  const cache = value as Partial<UpdateCheckCache>
  if (typeof cache.latestVersion !== 'string') return undefined
  if (typeof cache.checkedAt !== 'string') return undefined
  return { latestVersion: cache.latestVersion, checkedAt: cache.checkedAt }
}

function formatUpdateNotice(currentVersion: string, latestVersion: string): string | undefined {
  if (compareVersions(currentVersion, latestVersion) >= 0) return undefined
  return `Update available: v${latestVersion} (current v${currentVersion}) · run ccsp update`
}

function resolveCachePath(homeDir: string): string {
  return join(resolveGlobalRoot(homeDir), 'update-check.json')
}

export function createUpdateCheckService(options: UpdateCheckServiceOptions) {
  const fetchText = options.fetchText ?? defaultFetchText
  const now = options.now ?? (() => new Date())
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
  const cachePath = resolveCachePath(options.homeDir)

  const readCache = (): UpdateCheckCache | undefined => {
    try {
      if (!existsSync(cachePath)) return undefined
      return parseCache(JSON.parse(readFileSync(cachePath, 'utf8')))
    } catch {
      return undefined
    }
  }

  const isCacheFresh = (cache: UpdateCheckCache | undefined): boolean => {
    if (!cache) return false
    const checkedAt = Date.parse(cache.checkedAt)
    if (Number.isNaN(checkedAt)) return false
    return now().getTime() - checkedAt < ttlMs
  }

  const writeCache = async (cache: UpdateCheckCache): Promise<void> => {
    await writeJsonFile(cachePath, cache)
  }

  return {
    readCachedNotice(): string | undefined {
      const cache = readCache()
      return cache ? formatUpdateNotice(options.currentVersion, cache.latestVersion) : undefined
    },

    async refreshInBackground(): Promise<void> {
      try {
        if (isCacheFresh(readCache())) return
        const latestVersion = await resolveLatestVersion(fetchText)
        await writeCache({ latestVersion, checkedAt: now().toISOString() })
      } catch {
        // Background update checks must never interrupt CLI startup.
      }
    },
  }
}
