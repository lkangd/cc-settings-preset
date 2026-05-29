import { pathExists, readJsonFile, writeJsonFile } from '../core/json.js'
import { resolveCcspConfigPath } from '../core/paths.js'
import { ccspConfigSchema, parseCcspConfig, type CcspConfig } from '../core/schema.js'

export function createCcspConfigService(globalRoot: string) {
  const filePath = resolveCcspConfigPath(globalRoot)

  async function read(): Promise<CcspConfig> {
    if (!(await pathExists(filePath))) return parseCcspConfig({})
    return parseCcspConfig(await readJsonFile(filePath))
  }

  async function write(config: CcspConfig): Promise<void> {
    await writeJsonFile(filePath, ccspConfigSchema.parse(config))
  }

  return {
    read,
    write,
    async setOption<K extends keyof CcspConfig>(key: K, value: CcspConfig[K]): Promise<void> {
      const current = await read()
      await write({ ...current, [key]: value })
    },
  }
}
