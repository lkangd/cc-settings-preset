# cc-settings-preset

`cc-settings-preset`（缩写命令 `ccsp`）是一个用于启动 Claude Code 前选择运行时 settings 的命令行工具。

它解决的是这样一个问题：你可能有多套 Claude Code `settings.json`，同时又希望按当前项目临时启用或禁用 plugins、skills、MCP servers。`ccsp` 会先选择完整 settings，再选择项目启动预设，最后生成完整临时 settings 并等价执行：

```bash
claude --settings <generated-settings-file> ...
```

## Features

- 管理 Claude Code 全局 settings 预设
- 项目级启动预设：保存 plugins、skills、MCP servers 的开关状态
- 自动发现本地可访问的 Claude settings、plugins、skills、MCP servers
- 启动前合并全局 settings 与项目启动预设，生成完整 settings 文件
- `Detected` 虚拟启动项：展示本次自动发现结果，默认全部开启
- 基于 Ink 的两阶段 TUI：settings 两栏选择 + 项目启动四栏选择
- 支持 `ccsp claude ...` 透传 Claude 参数

## Installation

### Requirements

- Node.js `>= 20.19.2`
- pnpm `>= 9`

### Install dependencies

```bash
pnpm install
```

### Build

```bash
pnpm run build
```

### Optional: link for local use

```bash
pnpm link --global
```

之后就可以直接使用：

```bash
ccsp
```

## Commands

### `ccsp`

进入默认两阶段运行流程：

1. 选择一个由 `ccsp create` 创建的全局 settings 预设。
2. 如果没有全局 settings 预设，则临时展示自动发现到的 settings 文件作为 fallback。
3. 进入项目启动预设选择界面，选择或调整 plugins、skills、MCP servers。
4. 启动前生成完整 settings 文件并启动 Claude Code。

### `ccsp claude ...args`

和 `ccsp` 一样进入运行流程，但会把后续参数透传给 Claude Code。

例如：

```bash
ccsp claude --resume
ccsp claude --continue
ccsp claude --print "hello"
```

`--settings` 是 `ccsp` 保留参数。如果用户透传了 `--settings`，它会被忽略，并输出红色警告。

### `ccsp create`

创建一个全局 settings 预设。

创建时会优先提供已检测到的 Claude settings 文件作为导入来源，也可以手动输入路径。

### `ccsp manage`

管理全局 settings 预设。

支持：

- 启动某个 settings 预设
- 重命名 settings 预设
- 删除 settings 预设

默认管理界面为两栏：左侧 settings 预设列表，右侧完整 JSON 树预览。

### `ccsp manage --project` / `ccsp manage -p`

管理当前项目的启动预设。

支持：

- 启动某个项目启动预设
- 调整 plugins、skills、MCP servers 开关
- 重命名项目启动预设
- 删除项目启动预设

项目启动管理界面为四栏：预设 / Plugins / Skills / MCPs。

## Preset Model

### 全局 settings 预设

全局 settings 预设是一个完整、可作为合并基础的 Claude Code `settings.json`。

它由 `ccsp create` 创建，通常用于表达模型、权限、hooks、环境变量等跨项目基础配置。

### 项目启动预设

项目启动预设只保存当前项目的运行时开关：

- `enabledPlugins`
- `skillOverrides`
- `deniedMcpServers`

它不保存完整 settings。启动前，`ccsp` 会把全局 settings 与项目启动预设合并成完整 settings 文件。

### `Detected`

`Detected` 是虚拟项目启动项，不写入磁盘。

它表示本次自动发现到的 plugins、skills、MCP servers，默认全部开启。如果用户修改 `Detected` 后启动，`ccsp` 会询问是否保存为新的项目启动预设；如果不保存，则写入保留的临时完整 settings 文件。

## Storage Layout

全局 settings 预设保存在：

```text
~/.ccsp/settings/
~/.ccsp/index.json
```

项目启动预设保存在当前项目：

```text
.claude/.ccsp/
  launch-presets/
    index.json
    <name>.json
  last-used.json
  tmp/
    <generated-settings>.json
```

`.claude/.ccsp/tmp/` 中的临时 settings 文件会保留，便于排查启动时实际传给 Claude Code 的配置。

创建 `.claude/.ccsp/` 时，如果当前项目存在 `.gitignore`，`ccsp` 会自动加入 `.claude/.ccsp/` 忽略项。

## TUI Overview

### 第一阶段：settings 选择

两栏界面：

- 左栏：全局 settings 预设列表
- 右栏：当前 settings 的完整 JSON 树预览

按键：

- `↑ / k`：上移
- `↓ / j`：下移
- `enter`：选择
- `q`：退出

### 第二阶段：项目启动选择

四栏界面：

- Presets：项目启动预设，第一项固定为 `Detected`
- Plugins：plugin 开关
- Skills：skill 开关
- MCPs：MCP server 开关

按键：

- `← / h`、`→ / l`：切换栏
- `↑ / k`、`↓ / j`：移动光标
- `p`：聚焦 Plugins
- `s`：聚焦 Skills
- `m`：聚焦 MCPs
- `t`：切换排序
- `space`：切换当前条目开关
- `enter`：启动
- `q`：退出

## Discovery Rules

`ccsp` 只发现磁盘上当前可访问的内容，不伪造不可读取的远端或企业配置。

### Settings discovery

`ccsp create` 会按优先级检测以下 Claude settings 文件：

1. 当前项目：`.claude/settings.local.json`
2. 当前项目：`.claude/settings.json`
3. 用户目录：`~/.claude/settings.json`

默认运行时第一阶段只展示已创建的全局 settings 预设。只有当没有全局 settings 预设时，才临时展示自动发现的 settings 文件。

### Skill discovery

非 plugin skills 从以下位置发现：

- `~/.claude/skills/<skill-name>/SKILL.md`
- 当前项目 `.claude/skills/<skill-name>/SKILL.md`
- 适用的父级项目 `.claude/skills/<skill-name>/SKILL.md`
- 当前项目 `.claude/commands/*.md`，作为 skill 兼容条目

说明：

- 如果某个 skill 目录是指向目录的符号链接，也会被识别
- 当同名 skill 和 command 同时存在时，skill 优先

### Plugin skill rules

plugin 提供的 skills 会以 `plugin-name:skill-name` 形式展示。

这类 skills：

- 会被自动发现
- 不能单独 toggle
- 只能通过所属 plugin 的开关控制

### Plugin state

plugin 冲突显示的是 resolved state，而不是逐来源展开。

### MCP discovery

MCP servers 按 Claude Code 的本地可读配置优先级发现并去重：

1. 本地 scope：`~/.claude.json` 中当前项目条目
2. 项目 scope：当前项目 `.mcp.json`
3. 用户 scope：`~/.claude.json`
4. 插件提供的 MCP servers
5. 本地配置中可读取到的 connector 数据

禁用 MCP server 时，项目启动预设写入：

```json
{
  "deniedMcpServers": [
    { "serverName": "github" }
  ]
}
```

`ccsp` 不写 `allowedMcpServers`，避免把未来新增 MCP server 意外锁死。

## Launch Behavior

最终启动 Claude Code 时，`ccsp` 使用子进程执行，而不是替换当前进程。

流程：

1. 读取第一阶段选择的完整 settings。
2. 读取第二阶段选择或临时调整得到的项目启动开关。
3. 合并生成完整 settings。
4. 写入 `.claude/.ccsp/tmp/<generated-settings>.json`。
5. 执行：

```bash
claude --settings <generated-settings-file> ...passthroughArgs
```

## Development

### Scripts

```bash
pnpm run typecheck   # TypeScript 全量类型检查（包含 tests）
pnpm run test        # 运行 Vitest
pnpm run build       # 构建 dist
pnpm run check       # typecheck + build + test
pnpm run test:coverage
```

### Local development

```bash
pnpm install
pnpm run check
pnpm run dev
```

## Tech Stack

- TypeScript
- Ink
- React
- Commander
- Zod
- Vitest

## Status

当前实现覆盖：

- 全局 settings 预设
- 项目启动预设
- 两阶段启动界面
- `create` / `manage` / `manage -p` / `claude` 透传命令
- plugin / skill / MCP 自动发现
- 启动前 settings 合并与临时 settings 文件生成

如果你要继续扩展，推荐优先查看：

- `src/cli.ts`
- `src/services/preset-service.ts`
- `src/services/launch-preset-service.ts`
- `src/services/plugin-service.ts`
- `src/services/skill-service.ts`
- `src/services/mcp-service.ts`
- `src/ink/`
