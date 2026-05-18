# cc-settings-preset

`cc-settings-preset`（缩写命令 `ccsp`）是一个用于启动 Claude Code 前选择运行时 settings 的命令行工具。

它解决的是这样一个问题：你可能有多套 Claude Code `settings.json`，或者想在某个基础配置之上临时关闭部分 plugins / skills，然后再用这套配置启动 Claude Code。`ccsp` 会在启动前帮你完成预设选择、派生配置复用/生成，并最终等价执行：

```bash
claude --settings <selected-settings-file> ...
```

## Features

- 管理 Claude Code 一级预设（base preset）
- 基于一级预设按 plugin / skill 开关生成二级预设（derived preset）
- 自动复用 toggle 结果一致的二级预设，避免重复生成
- 启动前自动同步二级预设与父一级预设的非 toggle 字段，避免配置漂移
- 自动发现本地可访问的 Claude settings、plugins、skills
- 基于 Ink 的三栏 TUI
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

进入默认运行流程：

1. 读取现有预设
2. 如果没有一级预设，先进入创建流程
3. 展示三栏界面选择预设 / plugins / skills
4. 选定后启动 Claude Code

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

创建一个一级预设。

创建时会优先提供已检测到的 Claude settings 文件作为导入来源，也可以手动输入路径。

### `ccsp manage`

管理已有预设。

支持：

- 启动某个预设
- 重命名预设
- 删除预设

删除或重命名后会返回预设列表，不会直接退出。

## Preset Model

### 一级预设（base preset）

一级预设是一个完整、可直接传给 Claude Code 的 `settings.json`。

### 二级预设（derived preset）

二级预设也是一个完整的 `settings.json`，但它来源于某个一级预设，并通过以下两个字段表达运行时 toggle：

- `enabledPlugins`
- `skillOverrides`

二级预设的用途是：在不改动一级预设原文件的情况下，按当前交互界面里的 plugin / skill 开关结果生成一份可启动配置。

### Derived preset reuse

当你修改了 plugin / skill 开关后，`ccsp` 会：

1. 计算当前 resolved toggle 状态
2. 查找是否已有 toggle 结果完全一致的二级预设
3. 如果有则直接复用
4. 如果没有则提示输入名称并创建新的二级预设

### Derived preset sync

每次使用二级预设启动前，`ccsp` 都会从其父一级预设同步除以下字段之外的所有内容：

- `enabledPlugins`
- `skillOverrides`

这样可以避免父预设更新后，二级预设长期漂移。

## Storage Layout

所有预设都保存在：

```text
~/.ccsp/settings/
```

索引信息保存在：

```text
~/.ccsp/index.json
```

其中索引记录预设类型、父子关系、文件名和时间戳等元数据。

## TUI Overview

运行 `ccsp` 后，主界面为三栏：

- 左栏：Settings
- 中栏：Plugins
- 右栏：Skills

一级和二级预设会同时显示在左栏中，二级预设以树状结构展示在其父一级预设下。

### Run mode keys

- `↑ / k`：上移
- `↓ / j`：下移
- `p`：聚焦到 plugins 列
- `s`：聚焦到 skills 列
- `space`：切换当前 plugin / skill 开关
- `esc`：返回 settings 列
- `enter`：启动当前选择
- `q`：退出

### Manage mode keys

- `↑ / k`：上移
- `↓ / j`：下移
- `enter / l`：启动当前预设
- `r`：重命名
- `d`：删除
- `q`：退出

## Discovery Rules

`ccsp` 只发现磁盘上当前可访问的内容，不处理 managed / enterprise 远端配置。

### Settings discovery

创建一级预设时，会按优先级检测以下 Claude settings 文件：

1. 当前项目：`.claude/settings.local.json`
2. 当前项目：`.claude/settings.json`
3. 用户目录：`~/.claude/settings.json`

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

## Launch Behavior

最终启动 Claude Code 时，`ccsp` 使用子进程执行，而不是替换当前进程。

效果等价于：

```bash
claude --settings <preset-file> ...passthroughArgs
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

当前实现已覆盖：

- base / derived preset 模型
- 三栏运行界面
- create / manage / `claude` 透传命令
- plugin / skill 自动发现
- derived preset 复用与启动前同步

如果你要继续扩展，推荐优先查看：

- `src/cli.ts`
- `src/services/preset-service.ts`
- `src/services/plugin-service.ts`
- `src/services/skill-service.ts`
- `src/ink/`
