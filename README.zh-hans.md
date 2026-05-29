<p align="center">
  <a href="https://github.com/lkangd/cc-settings-preset">
    <img
      src="https://raw.githubusercontent.com/lkangd/cc-settings-preset/main/assets/ccsp-logo.png"
      alt="CCSP — Claude Code Settings Preset"
      width="420"
    />
  </a>
</p>

<p align="center">
  <strong>为 Claude Code 提供可切换、可复用的运行时 Settings 预设选择器。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lkangd/cc-settings-preset"><img src="https://img.shields.io/npm/v/@lkangd/cc-settings-preset?style=flat-square" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@lkangd/cc-settings-preset"><img src="https://img.shields.io/npm/dm/@lkangd/cc-settings-preset?style=flat-square&color=cb3837&label=downloads" alt="npm 月下载量" /></a>
  <a href="https://www.npmjs.com/package/@lkangd/cc-settings-preset"><img src="https://img.shields.io/npm/dt/@lkangd/cc-settings-preset?style=flat-square&label=total" alt="npm 总下载量" /></a>
  <a href="https://github.com/lkangd/cc-settings-preset/blob/main/LICENSE"><img src="https://img.shields.io/github/license/lkangd/cc-settings-preset?style=flat-square" alt="license" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/@lkangd/cc-settings-preset?style=flat-square" alt="node version" /></a>
  <a href="https://github.com/lkangd/cc-settings-preset/commits/main"><img src="https://img.shields.io/github/last-commit/lkangd/cc-settings-preset?style=flat-square" alt="最近提交" /></a>
  <a href="https://github.com/lkangd/cc-settings-preset"><img src="https://img.shields.io/github/stars/lkangd/cc-settings-preset?style=flat-square" alt="stars" /></a>
  <a href="https://github.com/lkangd/cc-settings-preset/issues"><img src="https://img.shields.io/github/issues/lkangd/cc-settings-preset?style=flat-square" alt="issues" /></a>
</p>

<p align="center">
  <img
    src="https://raw.githubusercontent.com/lkangd/cc-settings-preset/main/assets/screen-shot.png"
    alt="CCSP 交互界面：基础预设选择与项目启动开关"
    width="900"
  />
</p>

<p align="center">
  <em>典型流程：先选全局基础预设（左）并以 YAML 或 JSON 预览其配置（右），再在项目启动层切换插件 / Skill / MCP，最后启动 Claude Code。</em>
</p>

[English](README.md) | **简体中文**

---

## Quick Start

**前置条件：** 已安装 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI（`claude` 在 `PATH` 中可用）。

### 安装

**macOS（Homebrew，推荐）** — 通过个人 tap [lkangd/homebrew-tap](https://github.com/lkangd/homebrew-tap) 安装，会自动拉取 Node.js 20 依赖：

```bash
brew tap lkangd/tap
brew install cc-settings-preset
```

**npm / pnpm** — 需本机已有 Node.js ≥ 20.19.2：

```bash
npm install -g @lkangd/cc-settings-preset
# 或
pnpm add -g @lkangd/cc-settings-preset
```

安装后可用 `ccsp` 或 `cc-settings-preset` 命令。

### 使用

```bash
# 在项目目录中启动（推荐入口）
ccsp

# 透传 Claude Code 参数（ccsp 会接管 --settings）
ccsp claude --help
ccsp claude -p "review this PR"

# 恢复本项目最近退出的会话，并复用其原始预设 / 启动配置
ccsp --continue

# 按 session id 精确恢复某个会话，复用启动时所用的预设 / 启动配置
ccsp --resume 99580820-9437-475c-883c-399bcfba3c47
```

**首次使用建议：**

```bash
# 1. 从现有 settings 导入一份「全局基础预设」
ccsp create

# 2. 进入项目，选择预设并配置本次启动的插件 / Skill / MCP，然后启动 Claude
ccsp

# 3. 管理全局预设或项目启动预设
ccsp manage
ccsp manage --project
```

---

## 使用场景

CCSP（**C**laude **C**ode **S**ettings **P**reset）面向「同一份 Claude Code 配置，需要在不同上下文里快速切换」的日常开发。典型场景如下。

### 1. 多模型 / 多后端环境切换

你在不同项目里使用不同的 API Key、`ANTHROPIC_BASE_URL`、默认模型（如 Opus / Sonnet / 自建网关）。手动改 `~/.claude/settings.json` 容易串环境。

**做法：** 用 `ccsp create` 为每个环境保存一份**全局基础预设**（含 `env`、模型相关字段等），进入项目后 `ccsp` 选预设即可，无需反复编辑主 settings 文件。

### 2. 按项目控制插件、Skill、MCP

同一套全局配置下，项目 A 需要关闭某官方插件、项目 B 要禁用 Chrome DevTools MCP、项目 C 要关掉部分 Skill。

**做法：** 在项目内用**启动预设**（Launch Preset）只覆盖 `enabledPlugins`、`skillOverrides`、`deniedMcpServers`，与全局基础预设合并后生成临时 settings，再启动 `claude`。

### 3. 团队内共享「基础配置」，个人保留「启动差异」

团队可约定把 `.claude/settings.json` 提交进仓库作为项目基线；个人仍可在本机维护全局预设，并在 `.claude/.ccsp/` 下保存自己的启动组合（默认被 gitignore，避免误提交密钥）。

### 4. 替代「记住一长串 claude 命令」

以前可能需要：

```bash
claude --settings ~/.claude/my-api-1.json -- ...
```

**做法：** `ccsp` / `ccsp claude -- ...` 在 TUI 里选预设、勾选开关，由工具生成临时 settings 路径并调用 `claude --settings <generated>`。

### 5. 配置管理与预览

- `ccsp manage`：浏览、重命名、删除全局基础预设，预览配置（YAML / JSON），并可直接从管理界面启动。
- `ccsp manage --project`：管理当前仓库下的启动预设（创建 / 保存 / 重命名 / 删除 / 启动）。

---

## 工作原理

### 两层预设模型

| 层级 | 存储位置 | 作用 |
|------|----------|------|
| **全局基础预设**（Base Preset） | `~/.ccsp/settings/*.json` | 一份完整的 settings 快照（可从 user / project / project-local 或任意 JSON 导入） |
| **项目启动预设**（Launch Preset） | `<项目>/.claude/.ccsp/launch-presets/*.json` | 仅记录相对基础的**差异**：插件开关、Skill 覆盖、MCP 拒绝列表 |

启动时 CCSP **不会直接改写** `~/.claude/settings.json` 或项目里的 `.claude/settings.json`，而是写入 **临时合并文件**（`.claude/.ccsp/tmp/<timestamp>-settings.json`），再执行：

```text
claude --settings <临时文件> [你传入的其它参数]
```

### ASCII 逻辑图

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           用户执行 ccsp / ccsp claude                    │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ① 发现现有 Settings 来源（按存在性收集，非运行时合并）                         │
│    · .claude/settings.local.json  (project-local)                       │
│    · .claude/settings.json        (project)                             │
│    · ~/.claude/settings.json      (user)                                │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
         ~/.ccsp 中已有基础预设？                  尚无基础预设
                    │                                   │
                    ▼                                   ▼
    ┌───────────────────────────┐          使用空基础 {} 或
    │ TUI：选择全局基础预设       │          先 ccsp create 导入
    │ （记住每个 cwd 上次选择）   │
    └───────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ② 解析「有效基线」                                                          │
│    · 插件：user < project < project-local < 所选基础预设                   │
│    · Skill：扫描 ~/.claude/skills、项目 skills/commands、已启用插件缓存      │
│    · MCP：合并 .mcp.json、~/.claude.json、插件 manifest 等来源              │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ③ TUI：项目启动层（Launch Preset）                                         │
│    · 左：已有启动预设列表  右：插件 | Skill | MCP 三列开关                     │
│    · 可保存为新预设 / 覆盖当前预设 / 临时启动不保存                             │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ④ finalizeSettings(base, launch)                                        │
│    · 以基础预设为主拷贝全文                                                 │
│    · 去掉基础里的 enabledPlugins / skillOverrides / deniedMcpServers      │
│    · 再写入 launch 层的上述三个字段（若有）                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ⑤ 写入 .claude/.ccsp/tmp/*.json（目录默认 gitignore，最多保留 50 份）        │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ⑥ spawn: claude --settings <tmp> [sanitized args]                       │
│    · 剥离用户传入的 --settings / --settings=...（由 ccsp 统一管理）          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 针对 Claude Code Settings 的痛点

| 痛点 | 说明 |
|------|------|
| **多文件、多层作用域** | Claude Code 同时存在 user / project / project-local settings，手工维护时难以一眼看清「最终生效」的是哪一层。 |
| **切换成本高** | 换 API、换模型、换插件组合往往要改 JSON 或记不同 `--settings` 路径。 |
| **易误改主配置** | 直接编辑 `~/.claude/settings.json` 容易把个人密钥、全局默认一起改掉。 |
| **插件 / Skill / MCP 分散** | `enabledPlugins`、`skillOverrides`、`deniedMcpServers` 与 `env` 等字段混在同一文件，缺少面向「本次启动」的轻量视图。 |
| **提交风险** | 项目 settings 若含 `env` 里的 Key，误提交到 Git 风险高。 |

### CCSP 的优势

- **非破坏性启动**：通过临时 settings 文件注入配置，不强制覆盖你的主 settings 文件。
- **两层分离**：全局「基础环境」与项目「启动差异」解耦，适合多仓库并行开发。
- **可视化开关**：在终端 TUI 中浏览 JSON、切换插件 / Skill / MCP，比手改数组更不易出错。
- **记忆上次选择**：按项目目录记住上次使用的基础预设与启动预设。
- **可恢复会话**：每次启动都会把会话与所用预设 / 启动配置绑定，`ccsp --continue` 与 `ccsp --resume <id>` 可一键恢复原配置并续上对应 Claude 会话。
- **安全默认值**：`.claude/.ccsp/` 初始化时写入 `.gitignore`（忽略全部），降低临时文件与本地预设误提交概率。

### 会话恢复（Session Resume）

Claude 退出后，CCSP 会**主动发现** Claude 真实分配的 session id（启动前对 `~/.claude/projects/<编码后的 cwd>/` 做快照，退出时做 diff——`--session-id` 在交互模式下并不可靠，所以我们不直接 pin），并把它和本次启动配置绑定，存入 `.claude/.ccsp/sessions.json`（最多 50 条，按 lastUsedAt 淘汰）：

- `ccsp --resume <uuid>`：用绑定里的输入重新 finalize 启动配置，并以 `claude --resume <uuid>` 一步启动。
- `ccsp --continue`：选取本项目里**最近退出**的 ccsp 会话，按其 id 确定性地恢复。具体例子：先启 A 再启 B，先退出 A，再 `ccsp --continue`，恢复的是 A（带 A 当时的预设 / 启动配置），不是 B。
- 若绑定对应的 Claude 会话已不存在（如旧版本残留），CCSP 会丢弃该绑定并回退到交互式选择。

### 局限与误解澄清（请务必阅读）

| 不能做到 / 需注意 | 说明 |
|-------------------|------|
| **不是 Claude Code 替代品** | 仅包装 `claude` 子进程；未安装 CLI 时会报错退出。 |
| **不自动回写主 settings** | 不会把合并结果写回 `~/.claude/settings.json`；若你希望永久生效，仍需自行同步或使用 `ccsp create` 更新基础预设。 |
| **接管 `--settings`** | 传入的 `--settings` 会被忽略并提示警告；路径由 CCSP 生成。 |
| **启动层字段有限** | Launch Preset 只覆盖 `enabledPlugins`、`skillOverrides`、`deniedMcpServers`；其它字段（如 `env`）来自基础预设。 |
| **不能通过 UI 新增 MCP Server** | 仅支持基于已发现 MCP 的**禁用**（`deniedMcpServers`），不能创建新 server 配置。 |
| **无无头 / CI 模式** | 主流程为 Ink 交互界面；`create` / `manage` 亦为 TUI，不适合纯脚本无人值守选型（除非自行读写 JSON）。 |
| **Derived 预设** | 数据模型支持 `derived` 类型，但当前 CLI 未暴露创建/管理衍生预设的完整流程。 |
| **项目存储默认本地** | `launch-presets`、`tmp` 与 `sessions.json` 都在 `.claude/.ccsp/` 下，默认不进 Git；团队共享需另行约定导出方式。 |
| **临时文件有上限** | `tmp` 中的 settings 文件按 lastUsedAt 淘汰，最多保留 50 份；statusline 脚本每次退出都会清理。 |
| **Resume 只覆盖 ccsp 启动的会话** | `ccsp --continue` / `--resume` 只能看到通过新版 ccsp 启动并记录过绑定的会话；直接用 `claude` 启动的会话不在范围内。 |

---

## 命令参考

| 命令 | 说明 |
|------|------|
| `ccsp` | 默认流程：选基础预设 → 配置启动层 → 启动 `claude` |
| `ccsp claude [args...]` | 同上，并将 `args` 传给 `claude`（不含 `--settings`） |
| `ccsp --continue` | 恢复本项目最近退出的 ccsp 会话，复用原始预设 / 启动配置 |
| `ccsp --resume <uuid>` | 按 session id 精确恢复某个会话，复用启动时所用的预设 / 启动配置（未知绑定时回退到交互式选择） |
| `ccsp create` | 交互式创建全局基础预设 |
| `ccsp manage` | 管理全局基础预设（预览 / 重命名 / 删除 / 新建 / 启动） |
| `ccsp manage --project` | 管理当前项目的启动预设 |
| `ccsp config` | 配置 ccsp 偏好（仅 env 预览、statusline） |

### 常用快捷键（TUI）

**选择基础预设：** `j`/`k` 或方向键移动，`f` 在「仅 env」与「完整配置」预览间切换，`Enter` 确认，`q` 退出。

**管理全局预设（`ccsp manage`）：** `l` 启动，`r` 重命名，`d` 删除，`c` 新建，`o` 在 Finder 中打开文件，`q` 退出。

**项目启动层：** 在预设与插件 / Skill / MCP 列间切换并开关；支持保存为启动预设。终端内 `Ctrl+L` 可刷新界面。

**配置（`ccsp config`）：** `j`/`k` 或方向键移动，`space`/`Enter` 切换当前选项，`q` 退出。

### 偏好设置（`ccsp config`）

`ccsp config` 打开左右两栏视图（左侧为选项，右侧为当前聚焦选项的说明），用于管理存放在 `~/.ccsp/config.json` 的全局（按用户）偏好。两项默认均为 **开启**：

| 选项 | 默认 | 作用 |
|------|------|------|
| **Global preset env-only** | 开启 | 基础预设选择页默认只预览所选预设的 `env` 字段。在该页面按 `f` 可在「仅 env」与「完整配置」视图间切换；关闭后默认展示完整配置。 |
| **Show statusline** | 开启 | 在 Claude Code 底部注入 ccsp statusline，显示当前预设与开关概览（`CCSP: <base>/<launch> \| plugins(…) \| skills(…) \| MCPs(…)`）。关闭后不再注入，也不会生成任何 statusline 脚本。 |
| **Settings preview format** | `yaml` | 基础预设选择页（`ccsp`）与管理页（`ccsp manage`）右侧预览所选预设配置的渲染格式 —— `yaml` 或 `json`，两者都带语法高亮。 |

---

## 目录结构

```text
~/.ccsp/
├── index.json                 # 全局基础预设索引
├── settings/
│   └── <name>-settings.json   # 基础预设内容
├── config.json                # 用户偏好（仅 env 预览、statusline）
└── last-settings.json         # 各项目 cwd 上次使用的基础预设名

<项目>/.claude/.ccsp/          # 默认整目录 gitignore
├── launch-presets/
│   ├── index.json
│   └── <name>-launch.json     # 仅含启动层覆盖字段
├── tmp/
│   └── <stem>-settings.json   # 本次启动的最终配置（最多 50 份，按使用时间淘汰）
├── sessions.json              # sessionId → 启动配置 的绑定，供 --continue / --resume
└── last-used.json             # 上次使用的启动预设
```

---

## 从源码开发

```bash
git clone https://github.com/lkangd/cc-settings-preset.git
cd cc-settings-preset
pnpm install
pnpm run dev          # 直接跑 tsx src/cli.ts
pnpm run check        # typecheck + build + test
```

---

## 贡献指南

欢迎 Issue 与 Pull Request。参与前建议：

1. **先搜已有 Issue**，避免重复讨论；新功能请先开 Issue 简述动机与用法。
2. **本地验证：** `pnpm run check` 须通过；若改动 CLI 行为，请补充或更新 `tests/` 下对应用例。
3. **风格：** 与现有代码保持一致（ESM、`strict` TypeScript、Ink 组件 + `flows/` 状态机）；避免无关重构。
4. **范围控制：** CCSP 聚焦 settings 预设与启动编排，不引入与 Claude Code 无关的重依赖。
5. **文档：** 用户可见行为变更请同步更新 `README.md` 与 `README.zh-hans.md`。
6. **提交信息：** 使用简洁英文或中文均可，说明「为什么」而不仅是「改了什么」。

**报告 Bug 请附带：** 操作系统、Node 版本、`ccsp` 调用方式、相关 `~/.ccsp` 或 `.claude/.ccsp` 结构（请打码密钥）、终端报错全文。

---

## License

[ISC](./LICENSE) © lkangd
