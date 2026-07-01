import spawn from 'cross-spawn'

import { CliError } from '../core/errors.js'

const PACKAGE_NAME = '@lkangd/cc-settings-preset'
const NPM_REGISTRY_URL = `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}`
const CHANGELOG_URL = 'https://raw.githubusercontent.com/lkangd/cc-settings-preset/main/CHANGELOG.md'
const HOMEBREW_NONINTERACTIVE_ENV: NodeJS.ProcessEnv = {
  HOMEBREW_NO_ASK: '1',
  HOMEBREW_NO_INSTALL_CLEANUP: '1',
}

type RunResult = { status: number | null; stdout: string; stderr: string }
type CommandInput = { command: string; args: string[]; inheritStdio?: boolean; env?: NodeJS.ProcessEnv }
export type CommandRunner = (input: CommandInput) => Promise<RunResult>

type UpdateServiceOptions = {
  currentVersion: string
  fetchText?: (url: string) => Promise<string>
  runCommand?: CommandRunner
  write?: (value: string) => void
}

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(part => Number.parseInt(part, 10) || 0)
  const rightParts = right.split('.').map(part => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

export function extractChangelogRange(changelog: string, currentVersion: string, latestVersion: string): string {
  const matches = [...changelog.matchAll(/^##\s+([^\s(]+).*$/gm)]
  const sections: string[] = []

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!
    const version = match[1]!
    if (compareVersions(version, currentVersion) <= 0 || compareVersions(version, latestVersion) > 0) continue

    const start = match.index ?? 0
    const end = matches[index + 1]?.index ?? changelog.length
    sections.push(changelog.slice(start, end).trim())
  }

  return sections.join('\n\n')
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new CliError(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  return response.text()
}

function defaultRunCommand(input: CommandInput): Promise<RunResult> {
  return new Promise(resolve => {
    const child = spawn(input.command, input.args, {
      env: input.env ? { ...process.env, ...input.env } : process.env,
      stdio: input.inheritStdio ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', error => resolve({ status: 1, stdout, stderr: error.message }))
    child.on('close', status => resolve({ status, stdout, stderr }))
  })
}

async function resolveLatestVersion(fetchText: (url: string) => Promise<string>): Promise<string> {
  const metadata = JSON.parse(await fetchText(NPM_REGISTRY_URL)) as { 'dist-tags'?: { latest?: string } }
  const latest = metadata['dist-tags']?.latest
  if (!latest) throw new CliError('Unable to resolve latest ccsp version from npm registry.')
  return latest
}

async function detectInstallSource(runCommand: CommandRunner): Promise<'brew' | 'npm'> {
  const brew = await runCommand({ command: 'brew', args: ['list', '--formula', 'cc-settings-preset'] })
  if (brew.status === 0) return 'brew'

  const npm = await runCommand({ command: 'npm', args: ['ls', '-g', PACKAGE_NAME, '--depth=0', '--json'] })
  if (npm.status === 0) return 'npm'

  throw new CliError('Unable to detect ccsp install source. Install with Homebrew or npm, then retry.')
}

export function createUpdateService(options: UpdateServiceOptions) {
  const fetchText = options.fetchText ?? defaultFetchText
  const runCommand = options.runCommand ?? defaultRunCommand
  const write = options.write ?? (value => process.stderr.write(value))

  return {
    async update(): Promise<void> {
      write(`Current ccsp version: ${options.currentVersion}\n`)
      write('Checking latest ccsp version...\n')
      const latestVersion = await resolveLatestVersion(fetchText)

      if (compareVersions(options.currentVersion, latestVersion) >= 0) {
        write('ccsp is already up to date.\n')
        return
      }

      write(`Latest ccsp version: ${latestVersion}\n`)
      write(`Updating ccsp from ${options.currentVersion} to ${latestVersion}.\n\n`)

      const changelog = extractChangelogRange(await fetchText(CHANGELOG_URL), options.currentVersion, latestVersion)
      write(changelog ? `${changelog}\n\n` : 'No changelog entries found for this update.\n\n')

      const source = await detectInstallSource(runCommand)
      if (source === 'brew') {
        write('Detected Homebrew install. Running noninteractive brew update and brew upgrade cc-settings-preset...\n')
        let result = await runCommand({
          command: 'brew',
          args: ['update', '--quiet'],
          inheritStdio: true,
          env: HOMEBREW_NONINTERACTIVE_ENV,
        })
        if (result.status !== 0) throw new CliError('brew update failed.')
        result = await runCommand({
          command: 'brew',
          args: ['upgrade', 'cc-settings-preset', '--yes'],
          inheritStdio: true,
          env: HOMEBREW_NONINTERACTIVE_ENV,
        })
        if (result.status !== 0) throw new CliError('brew upgrade cc-settings-preset failed.')
        return
      }

      write('Detected npm install. Running npm install -g @lkangd/cc-settings-preset@latest...\n')
      const result = await runCommand({ command: 'npm', args: ['install', '-g', `${PACKAGE_NAME}@latest`], inheritStdio: true })
      if (result.status !== 0) throw new CliError('npm install -g @lkangd/cc-settings-preset@latest failed.')
    },
  }
}
