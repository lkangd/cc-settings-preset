import { readJsonFileOrDefault, writeJsonFile } from '../core/json.js'
import { resolveGlobalLastSettingsPath } from '../core/paths.js'
import { lastSettingsSchema, type LastSettings } from '../core/schema.js'

export function createGlobalLastSettingsService(homeDir: string) {
  const filePath = resolveGlobalLastSettingsPath(homeDir)

  async function readState(): Promise<LastSettings> {
    return lastSettingsSchema.parse(await readJsonFileOrDefault(filePath, {}))
  }

  async function writeState(state: LastSettings): Promise<void> {
    await writeJsonFile(filePath, lastSettingsSchema.parse(state))
  }

  return {
    async readLastUsed(cwd: string): Promise<string | undefined> {
      return (await readState())[cwd]?.presetName
    },

    async writeLastUsed(cwd: string, presetName: string): Promise<void> {
      const state = await readState()
      state[cwd] = { presetName, updatedAt: new Date().toISOString() }
      await writeState(state)
    },
  }
}
