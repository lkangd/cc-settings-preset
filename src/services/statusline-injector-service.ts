import { promises as fs } from 'node:fs'

import {
  resolveCcspStatuslineUnderlyingCommandPath,
  resolveCcspStatuslineUnderlyingPath,
  resolveCcspStatuslineWrapperPath,
  type PathContext,
} from '../core/paths.js'
import type { Settings } from '../core/schema.js'
import type { ProjectLaunchToggleState } from '../flows/project-launch-flow.js'
import { enabledToggleCount } from '../flows/toggle-utils.js'
import { ensureProjectCcspStore } from './project-store-service.js'
import type { ResolvedStatusLine, StatusLineConfig } from './statusline-resolver-service.js'

export type CcspStatusLineMeta = {
  presetLabel: string
  toggles: ProjectLaunchToggleState
}

function formatToggleSummary(toggles: ProjectLaunchToggleState): string {
  const pluginsEnabled = enabledToggleCount(toggles.plugins)
  const skillsEnabled = enabledToggleCount(toggles.skills)
  const mcpsEnabled = enabledToggleCount(toggles.mcps)
  return [
    `plugins(${pluginsEnabled}/${toggles.plugins.length})`,
    `skills(${skillsEnabled}/${toggles.skills.length})`,
    `MCPs(${mcpsEnabled}/${toggles.mcps.length})`,
  ].join(' | ')
}

function formatCcspStatusLine(meta: CcspStatusLineMeta): string {
  return `CCSP: ${meta.presetLabel} | ${formatToggleSummary(meta.toggles)}`
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

// 保持原样直接把 commandPath 的内容交给 `bash -c` 执行（byte-for-byte 转发 stdin，不用
// here-string 以免额外带上尾随换行）。真实的 statusLine 命令不保证是单条简单命令——
// `cd /repo && node x.js`、`printf a; printf b` 这类由 `&&`/`;` 连接的复合命令很常见；
// 早先在这里用 `eval "exec $cmd"` 试图省掉一层子进程，但 `exec` 只对它后面紧跟的第一条
// simple command 生效（`exec cd ... && rest` 只有 cd 被 exec，rest 要么整体被跳过要么语义
// 走样），会直接改变复合命令的行为，是错误的优化方向。取消时的孤儿进程问题改在外层
// buildWrapperScript 用进程组 kill 统一兜底，这一层无需为此改变语义。
function buildUnderlyingScript(commandPath: string): string {
  return `#!/usr/bin/env bash
set -euo pipefail
input=$(cat)
printf '%s' "$input" | bash -c "$(cat ${shellQuote(commandPath)})"
`
}

// 外层 wrapper 必须在 underlying 输出之后追加自己的 CCSP 行，天然没法整体 exec 交棒——
// underlying 只能作为真正的子进程跑，而且它内部可能还会自己再 fork/后台化（比如用户的
// statusLine 命令本身写了 `... & wait`）。用 `set -m` 让这次 `&` 后台任务成为独立的进程组
// （pgid = 子进程自身 PID），只要它自己不再显式开新的进程组，它 fork 出的所有子孙进程都留在
// 这同一个组里。CC 取消刷新时只会 kill 这个 wrapper 自身的顶层 PID；这里的 trap 在收到
// TERM/INT 或正常退出时都会主动 kill 整个进程组，把 underlying 那条链路（不管多深）一次性
// 收干净，不会有孤儿继续持有 stdout 管道。cleanup 用一个标记位保证只执行一次，避免信号 trap
// 和 EXIT trap 重复触发（当前两步都是幂等的，标记位是防止未来往 cleanup 里加非幂等逻辑时出错）。
function buildWrapperScript(input: {
  underlyingScriptPath?: string | undefined
  ccspLine: string
}): string {
  const lines: string[] = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'input=$(cat)',
  ]

  if (input.underlyingScriptPath) {
    lines.push(
      'set -m',
      'tmp="$(mktemp)"',
      'underlying_pid=""',
      'cleaned_up=""',
      'cleanup() {',
      '  [ -n "$cleaned_up" ] && return',
      '  cleaned_up=1',
      '  if [ -n "$underlying_pid" ]; then',
      '    kill -TERM "$underlying_pid" 2>/dev/null',
      '    kill -TERM -- "-$underlying_pid" 2>/dev/null',
      '  fi',
      '  rm -f "$tmp"',
      '}',
      'trap cleanup EXIT',
      "trap 'cleanup; exit 143' TERM INT",
      `printf '%s' "$input" | bash ${shellQuote(input.underlyingScriptPath)} >"$tmp" 2>/dev/null &`,
      'underlying_pid=$!',
      'if wait "$underlying_pid"; then',
      '  underlying_out="$(cat "$tmp")"',
      '  printf "%s\\n" "$underlying_out"',
      'fi',
      'underlying_pid=""',
    )
  }

  lines.push(`printf '\\033[36m%s\\033[0m\\n' ${shellQuote(input.ccspLine)}`)

  return `${lines.join('\n')}\n`
}

function buildInjectedStatusLineConfig(
  wrapperPath: string,
  resolved?: ResolvedStatusLine,
): StatusLineConfig {
  const config: StatusLineConfig = {
    type: 'command',
    command: wrapperPath,
  }

  if (resolved?.config.padding !== undefined) config.padding = resolved.config.padding
  config.refreshInterval = resolved?.config.refreshInterval ?? 5
  if (resolved?.config.hideVimModeIndicator !== undefined) {
    config.hideVimModeIndicator = resolved.config.hideVimModeIndicator
  }

  return config
}

export type InjectedLaunchSettings = Settings & {
  statusLine: StatusLineConfig
}

export async function injectCcspStatusLine(input: {
  settings: Settings
  resolved?: ResolvedStatusLine
  meta: CcspStatusLineMeta
  context: PathContext
  stem: string
}): Promise<InjectedLaunchSettings> {
  const stem = input.stem
  const ccspLine = formatCcspStatusLine(input.meta)

  await ensureProjectCcspStore(input.context.cwd)

  let underlyingScriptPath: string | undefined
  if (input.resolved) {
    const commandPath = resolveCcspStatuslineUnderlyingCommandPath(input.context.cwd, stem)
    const underlyingPath = resolveCcspStatuslineUnderlyingPath(input.context.cwd, stem)
    await fs.writeFile(commandPath, input.resolved.config.command, 'utf8')
    await fs.writeFile(underlyingPath, buildUnderlyingScript(commandPath), 'utf8')
    await fs.chmod(underlyingPath, 0o755)
    underlyingScriptPath = underlyingPath
  }

  const wrapperPath = resolveCcspStatuslineWrapperPath(input.context.cwd, stem)
  await fs.writeFile(
    wrapperPath,
    buildWrapperScript({
      ccspLine,
      ...(underlyingScriptPath ? { underlyingScriptPath } : {}),
    }),
    'utf8',
  )
  await fs.chmod(wrapperPath, 0o755)

  return {
    ...input.settings,
    statusLine: buildInjectedStatusLineConfig(wrapperPath, input.resolved),
  }
}
