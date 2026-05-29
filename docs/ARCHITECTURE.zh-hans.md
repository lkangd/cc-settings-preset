# 架构

本文档描述 `cc-settings-preset` (`ccsp`) 的高层架构。如果你准备开始阅读代码，
这里是合适的起点。

产品定位、安装说明与 CLI 用法参见 [`README.zh-hans.md`](README.zh-hans.md)。
本文档只关注**系统如何构建**。

## 鸟瞰图

```
                              用户调用
                                  │
                                  ▼
                        ┌────────────────────┐
                        │   src/cli.ts       │   commander + 手写
                        │   （入口）          │   argv 解析
                        └────────┬───────────┘
                                 │
                  ┌──────────────┼──────────────┐
                  ▼              ▼              ▼
            ┌──────────┐    ┌───────────┐    ┌──────────┐
            │  ink/    │    │ flows/    │    │ services/│
            │ React    │◄──►│ 纯 reducer│◄──►│ 文件 IO、  │
            │  TUI     │    │           │    │ 发现逻辑   │
            └──────────┘    └───────────┘    └────┬─────┘
                                               │
                                               ▼
                                       ┌───────────────┐
                                       │   core/       │
                                       │ paths、schema、│
                                       │ json、spawn   │
                                       └───────┬───────┘
                                               │
                          已合成的 settings.json │
                          + 注入的 statusline   ▼
                                       ┌───────────────┐
                                       │  claude CLI   │
                                       │  (cross-spawn)│
                                       └───────────────┘
```

`ccsp` 是一个启动器：为下一次 `claude` 调用挑选一份 Claude Code `settings.json`。
它先选一个全局"基础"预设（base preset），再叠加一个项目级的"启动"预设
（launch preset），向最终 settings 注入一段 CCSP 自识别 statusline 让运行中的
会话能显示当前所用预设，把结果写到一个临时文件，最后 `spawn` 一份
`claude --settings <temp>` 并继承 stdio。

`src/cli.ts` 是唯一的入口。它负责 argv 解析（包含 `ccsp claude …` 透传、
`--continue`、`--resume <uuid>` 等隐式模式）、顶层的交互循环、以及把各个
service 串联起来的全部编排。子命令（`create`、`manage`、`manage --project`）
只有当首个位置参数不是某个隐式模式时，才会走 `commander` 处理。

`src/ink/` 是 React/`ink` TUI：一个 `Create` 流，两个 `Manage` 流（全局预设、
项目级启动预设），一个 `SettingsSelect` 流，以及最复杂的屏幕 ——
`ProjectLaunchApp`：一个四列开关网格（预设 / 插件 / 技能 / MCP）。所有键盘
状态与选择逻辑都放在 `src/flows/`，它对外导出纯 reducer 函数，由 ink 组件以
`useReducer` 风格调用。这种拆分让每一次 TUI 状态迁移都可以在不渲染 React 的
情况下进行单元测试。

`src/services/` 是副作用层：每个文件都是一个工厂，闭包持有一个 `PathContext`
（`{ homeDir, cwd }`），对位于以下位置的 JSON 存储提供异步操作：`~/.ccsp/`
（全局预设和 `last-settings.json`）、`<cwd>/.claude/.ccsp/`（项目级启动预设、
会话绑定、临时 settings、statusline 包装脚本），以及宿主 Claude Code 的状态
（`~/.claude/settings.json`、`~/.claude.json`、
`/Library/Application Support/ClaudeCode/`）。

`src/core/` 是纯粹的叶子层：路径计算、JSON 读写、所有持久化格式的 Zod schema、
argv 清洗，以及把控制权交给真正 `claude` 二进制的 `cross-spawn` 包装。

**有意为之的非目标：** `ccsp` 不会解析、校验或修改 settings 文件中除它关心的
那三个键以外的语义内容（`enabledPlugins`、`skillOverrides`、
`deniedMcpServers`），其它字段都按原样穿透。Zod schema 全部使用
`z.looseObject`，正是为了让 Claude Code 新增 settings 字段时不必发布一版新的
`ccsp`。

## 代码地图

按"叶子优先"的顺序游览：`core/` 和 `services/` 在最底层；`flows/` 与 `ink/`
是消费者；`cli.ts` 是入口。

### `src/core/`

无任何 `ccsp` 特定业务逻辑的纯辅助代码。这里每个文件都可以被任何层 import，
import 自身没有副作用。

- [`src/core/paths.ts`](src/core/paths.ts) —— 应用接触到的所有文件系统路径，
  都是由 `PathContext` 推导出来的。这里是存储位置的权威清单：
  `~/.ccsp/{index.json, settings/…}`（全局预设）、
  `<cwd>/.claude/.ccsp/{launch-presets/, sessions.json, last-used.json, tmp/}`
  （项目级状态），以及对 Claude Code 自身状态的只读路径（`~/.claude/`、
  `~/.claude.json`、`/Library/Application Support/ClaudeCode/`）。
- [`src/core/schema.ts`](src/core/schema.ts) —— 所有持久化 JSON 文件的 Zod
  schema：`settings`（全局预设）、`launchPresetSettings`（项目级 overlay）、
  两个 index 文件、`lastSettings` map，以及 `sessionBinding` 记录。所有推导
  出来的 TypeScript 类型都从这里导出；其它地方不再定义任何 settings 形状。
- [`src/core/json.ts`](src/core/json.ts) —— `readJsonFile` / `writeJsonFile`
  / `pathExists`。原子写通过临时文件 + rename 完成。
- [`src/core/args.ts`](src/core/args.ts) —— argv 分类：
  `resolveSessionLaunch` 检测用户是否传入 `--continue`、`--resume <uuid>` 或
  `--session-id <uuid>`；`sanitizeClaudeArgs` 把用户传入的 `--settings` 剥
  掉，因为这个 flag 由 `ccsp` 独占。
- [`src/core/name.ts`](src/core/name.ts) —— 预设名规范化、文件名推导，以及
  让预设名"读时大小写不敏感、写时保留大小写"的 index 查找键解析器。
- [`src/core/spawn.ts`](src/core/spawn.ts) —— 唯一调用 `cross-spawn` 的位
  置。把 `ENOENT` 与非 0 退出码翻译成 `CliError`。
- [`src/core/errors.ts`](src/core/errors.ts) —— `CliError`，可携带可选的
  `exitCode`，方便 `cli.ts` 透传子进程的退出状态。

**架构不变量：** Settings schema 故意写得很松（`z.looseObject`）。`ccsp` 只
解析它自己要操作的三个键，其余未知字段全部保留。这样 Claude Code 新增 settings
键时不需要重新发版 `ccsp`。

**架构不变量：** `core/` 中的文件不会 import `services/`、`flows/`、`ink/`
任何一层。依赖图只朝内收敛 —— 这让整个 `core/` 层可以用表格驱动的单元测试覆
盖，不需要任何磁盘 fixture。

### `src/services/`

副作用模块，每个文件要么是一个 `createXxxService(deps)` 工厂，要么是一组无状
态异步函数。各 service 通过显式参数 (`homeDir` / `cwd` / `globalRoot`) 接收
依赖，而不是自己读 `process.env`；这些注入点由 `cli.ts` 在启动时统一装配。

#### 预设存储

- [`src/services/preset-service.ts`](src/services/preset-service.ts) —— 操
  作位于 `~/.ccsp/` 的 **全局** 预设存储：维护 `index.json`（id → metadata）
  以及 `settings/` 下每个预设的一份 settings JSON。用户已登录时还会合成一个
  叫做 `*Claude Official*` 的虚拟预设，直接读取 `~/.claude/settings.json`。
- [`src/services/launch-preset-service.ts`](src/services/launch-preset-service.ts)
  —— 操作位于 `<cwd>/.claude/.ccsp/launch-presets/` 的 **项目级** 启动预设
  存储，同时承担临时 settings 的写入（`writeTempSettings` →
  `<cwd>/.claude/.ccsp/tmp/<stem>-settings.json`）、会话绑定存储
  （`sessions.json`）以及临时产物的清理（`MAX_TEMP_SETTINGS_FILES = 50`）。
- [`src/services/project-store-service.ts`](src/services/project-store-service.ts)
  —— `ensureProjectCcspStore`：按需创建 `<cwd>/.claude/.ccsp/` 及其
  `launch-presets/`、`tmp/` 子目录，并写入包含 `*` 的 `.gitignore`，避免任
  何检出意外把预设状态提交进 git。
- [`src/services/global-last-settings-service.ts`](src/services/global-last-settings-service.ts)
  —— 记录每个 `cwd` 上次使用了哪个**全局**预设，方便 SettingsSelect 屏幕在
  下次启动时高亮回原选项。

**架构不变量：** 预设名查找大小写不敏感（`resolvePresetIndexKey`），但写入
时保留大小写。原因：用户在 `ccsp manage` 中将 `prod` 重命名为 `Prod` 时希望
得到他想要的重命名，同时一处程序化的 `readPreset('PROD')` 仍能拿到结果。

**架构不变量：** 任何对 `<cwd>/.claude/.ccsp/` 的目录写入都经由
`ensureProjectCcspStore`，它会始终（重新）写 `.gitignore: *`。这样即便用户
误执行 `git add .claude/`，仓库也是安全的。

**架构不变量：** 临时 settings 文件放在项目下，而不是 `os.tmpdir()`。原因：
用户回看 shell 历史时想知道"`ccsp` 这次到底用什么 settings 启动了 Claude"
—— 把文件与项目放在一起更易发现。清理逻辑保证目录不会无限增长。

#### 发现（把 Claude Code 状态读成类型化记录）

- [`src/services/settings-source-service.ts`](src/services/settings-source-service.ts)
  —— 枚举磁盘上实际存在的三类 Claude Code settings 源：`project-local`
  （`<cwd>/.claude/settings.local.json`）、`project`
  （`<cwd>/.claude/settings.json`）、`user`（`~/.claude/settings.json`）。
- [`src/services/managed-settings-service.ts`](src/services/managed-settings-service.ts)
  —— 读取 macOS managed-settings 的 drop-in 目录
  (`/Library/Application Support/ClaudeCode/managed-settings.d/*.json`)，对
  fragment 做深合并。只用于 statusline 解析。
- [`src/services/plugin-service.ts`](src/services/plugin-service.ts) ——
  给定一组 `{ scope, settings }` 源，求解每个插件最终的启用状态。优先级在代
  码中以 `ownershipPrecedence` 命名记录：`user < project < project-local`，
  并把 `preset` 视为单独的、较低优先级的来源。
- [`src/services/skill-service.ts`](src/services/skill-service.ts) —— 遍历
  四种 skill 来源：project（`<cwd>/.claude/skills/` 及其每一级祖先目录）、
  command 形态（`<cwd>/.claude/commands/*.md`）、user
  （`~/.claude/skills/`）、plugin（`~/.claude/plugins/cache/*/plugin.json`
  下、其宿主插件已启用的 plugin）。插件控制的 skill 会被报告为
  `toggleable: false`。
- [`src/services/mcp-service.ts`](src/services/mcp-service.ts) —— 从四种来
  源发现 MCP server：插件清单、用户 `~/.claude.json`（顶级与 per-project）、
  以及 `<cwd>/.mcp.json`。再叠加 `applyPluginMcpAvailability` 与
  `applyDeniedMcpServers` 得出最终启用状态。
- [`src/services/claude-session-service.ts`](src/services/claude-session-service.ts)
  —— 通过列出 `~/.claude/projects/<encoded-cwd>/*.jsonl` 来发现 Claude Code
  会话 ID。两种用途：（a）一次 launch 期间，通过 spawn 前后对比 jsonl 目录的
  快照差分得到 Claude 创建的会话 ID；（b）判断存储的 session binding 是否仍
  对应一份活的 transcript。
- [`src/services/claude-login-service.ts`](src/services/claude-login-service.ts)
  —— 回答"用户是否已登录 Claude"：检查
  `~/.claude/.credentials.json`，在 macOS 上再检查
  `Claude Code-credentials` 这个 keychain 条目（通过仅读 metadata 的
  `security find-generic-password` 完成，不会触发弹窗）。

**架构不变量：** 发现类 service 在遇到 `ENOENT` 时绝不抛错。Claude Code 的
状态目录全部都是可选的 —— 用户完全可能在没有 `~/.claude/` 的全新机器上跑
`ccsp`。每个 `readdir` / `stat` 调用点都要捕获 `ENOENT` 并返回空结果。

**架构不变量：** `claude-session-service` 通过在单次 `spawnClaude` 生命周期
里 **对比** jsonl 目录得到会话 ID，而不是用 `--session-id` 注入。原因：
Claude 在交互模式下会忽略 `--session-id`，而且在同一 `cwd` 下并发的 `ccsp`
launch 之间会互相抢 ID；这里以 `birthtimeMs` 最早者为准。

#### 组合

- [`src/services/disable-lock-service.ts`](src/services/disable-lock-service.ts)
  —— 给定一组 settings 源，找出当前"持有"某个禁用项的具体 *文件*（一条值
  为 `false` 的 plugin 条目、一条 `'off'` 的 skill override、或 `deniedMcpServers`
  里的一条 `serverName`）。UI 据此告诉用户禁用锁在哪里，
  `applyDisableRemovals` 则在用户确认重新启用时改写对应文件。
- [`src/services/statusline-resolver-service.ts`](src/services/statusline-resolver-service.ts)
  —— 按 Claude Code 标准优先级
  （`managed → project-local → project → user → 基础预设`）解析本次 launch
  实际生效的 statusline 命令。
- [`src/services/statusline-injector-service.ts`](src/services/statusline-injector-service.ts)
  —— 把解析得到的 statusline 命令包裹在一段 CCSP 包装 shell 脚本里：先运行
  原有命令，再用青色追加 CCSP 状态行
  （`CCSP: <global>/<launch> | plugins(n/N) | skills(n/N) | MCPs(n/N)`）。
  包装脚本放在 `<cwd>/.claude/.ccsp/tmp/`，由最终生成的 `settings.json` 引用。
- [`src/services/settings-finalizer-service.ts`](src/services/settings-finalizer-service.ts)
  —— 合成器：拿 base 预设与 launch 预设，先把 base 里三个 ccsp 管理的键删
  掉，再叠加 launch 的值，然后让 `injectCcspStatusLine` 给它挂一个指向包装
  脚本的 `statusLine` 配置。返回的 `Settings` 对象，就是最终写入临时文件、
  传给 `claude --settings` 的内容。

**架构不变量：** `finalizeSettings` 在合并 launch overlay 之前，总是从 base
中删除 `enabledPlugins`、`skillOverrides`、`deniedMcpServers` 三个键。原因：
launch 状态在 UI 中已经完整物化（每个应当 off 的开关都被记录），如果做"局部
合并"反而会把 base 中陈旧的启用项重新引回来。

**架构不变量：** statusline 包装脚本在 `set -euo pipefail` 中运行原命令，但
**忽略其退出状态**（`if underlying_out=$(… 2>/dev/null); then`）。无论如
何都会追加 CCSP 行。原因：用户那条坏掉的 statusline 绝不能把 CCSP 标记盖
住，因为这是会话内识别当前预设的唯一信号。

### `src/flows/`

TUI 的纯 reducer。不 import `ink/` 或 `react`。每个导出函数都接受
`(state, event)` 返回新 state，或接收前置状态 + 输入，返回派生展示状态。ink
组件只是把 `useInput` 的事件喂给这些 reducer 的薄壳。

- [`src/flows/project-launch-flow.ts`](src/flows/project-launch-flow.ts) ——
  目前最大的 flow。负责四列选择状态（预设、插件、技能、MCP）、焦点切换、排
  序模式、每个预设独立的 draft 状态（这样切换列里的预设不会丢失未保存的修
  改）、当用户尝试启用一个被更高优先级 settings 文件锁定为禁用的项时的"解
  锁确认"提示，以及供 `applyDisableRemovals` 使用的 `DisableRemovalMark`
  pending 列表。
- [`src/flows/run-flow.ts`](src/flows/run-flow.ts) —— 编排经典的 `ccsp` 交
  互流程（选 base → 可选地选 launch → 启动）。
- [`src/flows/manage-flow.ts`](src/flows/manage-flow.ts) —— 全局预设管理界面
  （`ccsp manage`）的 reducer。
- [`src/flows/create-flow.ts`](src/flows/create-flow.ts) —— `ccsp create`
  settings 源选择界面的 reducer。
- [`src/flows/settings-select-flow.ts`](src/flows/settings-select-flow.ts) ——
  run flow 中"挑一个 base 预设"小屏幕的 reducer。

**架构不变量：** 本文件夹下的 reducer 全部是同步、确定性的。任何异步 IO 都
由调用方 ink 组件或 `cli.ts` 在 reducer 跑之前/之后完成。这正是
[`tests/flows/`](tests/flows/) 可以不 mock React 就直接测试的原因。

**架构不变量：** `project-launch-flow` 把 `draftsByPreset` 与
`statesByPreset` 分开维护。后者是各预设已经保存到磁盘的状态；前者是内存中的
编辑缓冲。UI 显示的是 draft，只有显式的 Save / Save-as 操作才会把 draft 提升
到磁盘。原因：用户经常在多个 launch 预设之间反复切换以对比开关，焦点一切换
就丢编辑会让人崩溃。

### `src/ink/`

用 `ink` 渲染的 React 组件。每个 `*-app.tsx` 是一个顶层屏幕；`components/`
存放可复用 widget。

- [`src/ink/create-app.tsx`](src/ink/create-app.tsx) —— 选一个 settings 源
  导入为新的 base 预设。
- [`src/ink/manage-app.tsx`](src/ink/manage-app.tsx) —— 全局预设的列表 /
  重命名 / 删除，或带着选中项跳进 launch 流程。
- [`src/ink/settings-select-app.tsx`](src/ink/settings-select-app.tsx) ——
  挑 base 预设的界面，会自动选中上次使用的那个。
- [`src/ink/project-launch-app.tsx`](src/ink/project-launch-app.tsx) ——
  四列 launch 主屏。承载用于 disable-lock 解锁的 `ConfirmEnableUnlock` 与
  "另存为"用的 `TextInput`。
- [`src/ink/project-manage-app.tsx`](src/ink/project-manage-app.tsx) ——
  `ccsp manage --project` 用的 `project-launch-app` 变体，多了原地的重命
  名 / 删除 / 保存。
- [`src/ink/components/toggle-column.tsx`](src/ink/components/toggle-column.tsx)、
  [`src/ink/components/text-input.tsx`](src/ink/components/text-input.tsx)、
  [`src/ink/components/use-text-input.ts`](src/ink/components/use-text-input.ts)、
  [`src/ink/components/use-text-input-state.ts`](src/ink/components/use-text-input-state.ts)、
  [`src/ink/components/json-tree-view.tsx`](src/ink/components/json-tree-view.tsx)、
  [`src/ink/components/two-column-settings-view.tsx`](src/ink/components/two-column-settings-view.tsx)、
  [`src/ink/components/confirm-enable-unlock.tsx`](src/ink/components/confirm-enable-unlock.tsx)、
  [`src/ink/components/truncate-text.tsx`](src/ink/components/truncate-text.tsx)
  —— 可复用的基础组件。text-input 那一对把 ink 缺失的"带光标编辑器"实现成
  一个有类型的 reducer，因此可单元测试。
- [`src/ink/components/resize-context.tsx`](src/ink/components/resize-context.tsx)、
  [`src/ink/components/global-shortcut-handler.tsx`](src/ink/components/global-shortcut-handler.tsx)
  —— 终端 resize 管线。`cli.ts` 监听 `stdout.resize`、自增一个 version
  计数、再用 `InkResizeProvider` 重渲染整棵树，让深层组件不用一层层透传
  prop 也能读到最新的 `process.stdout.columns`。

**架构不变量：** ink 组件不持有任何预设 IO。它们通过 props 接收纯数据，并通
过 `onSubmit` / `onCreateSubmit` / `onSaveSubmit` 回调把动作返回给 `cli.ts`
中的 `renderXxxApp`，再由 `renderXxxApp` 翻译成 service 调用。这让 React 层
没有 `await fs.…`，测试中可以用 `react-test-renderer` 配合合成 props 驱动
组件。

### `src/cli.ts`

入口，也是顶层编排者。值得注意的几个形状：

- [`createProgram`](src/cli.ts) —— 通过 `commander` 声明两个显式子命令
  （`create`、`manage`）。
- [`main`](src/cli.ts) —— 手写的 argv 路由，先处理隐式模式（`ccsp` 无参 →
  run flow，`ccsp --continue|-c`，`ccsp --resume <uuid>`，`ccsp claude …`），
  再 fallback 到 `createProgram().parseAsync`。
- [`runInteractive`](src/cli.ts)、[`launchWithSelectedSettings`](src/cli.ts)、
  [`launchClaudeWithFinalizedSettings`](src/cli.ts) —— 三段式管线：选 base
  预设 → 选 launch 预设 → 合成并 spawn。
- [`buildBannerLines`](src/cli.ts) —— 自适应终端宽度的 `figlet` banner，带
  逐级降级（`ANSI Shadow` → `Small` → 纯文本），即便终端再窄也能出 logo。
- [`waitForInkAppExit`](src/cli.ts) 与 [`createGlobalShortcutHandler`](src/cli.ts)
  —— 每个 ink 屏幕都会接入的 resize / `ctrl-l` 重绘机制。
- [`runResume`](src/cli.ts)、[`runContinue`](src/cli.ts)、
  [`launchFromBinding`](src/cli.ts) —— 通过已存的 `SessionBinding` 重启
  Claude；从最近退出的会话开始往回走，对应 jsonl 已不存在的过期 binding 顺手
  剪掉。

**架构不变量：** `cli.ts` 是唯一一处把多个 service 串起来的地方。各 service
之间不互相 import（除了少量必要的共享依赖，比如 `project-store-service`）。
原因：这样可以保证有一份 grep 友好的"用户输入 `ccsp` 时实际运行了什么"的中
心文档。

**架构不变量：** 隐式 argv 模式必须在 `commander` 解析 **之前** 检测出来，因
为 `commander` 会把 `ccsp --resume <uuid>` 当成未知 flag。`main` 中手动检测
完后，只有显式子命令才会 fall-through 到 `commander`。

## 横切关注点

### Settings 键的归属与优先级

有三个 settings 键被 `ccsp` 与 Claude Code 自有 settings 文件共同管理：
`enabledPlugins`、`skillOverrides`、`deniedMcpServers`。`plugin-service`、
`skill-service`、`disable-lock-service` 全部实现同一套优先级
（`user < project < project-local`，`preset` 作为独立来源），且这套解析在两
个方向上都被用到：正向，求出 TUI 显示的 *最终* 状态；反向，当用户翻转一个开
关时，知道要去改哪个文件。

**架构不变量：** 同一份优先级表在 `plugin-service.ts`、`skill-service.ts`、
`disable-lock-service.ts` 中故意重复，而没有抽成一个公共 helper。原因：每种
对象的归属语义略有差别（skill 是字符串枚举 override，MCP 是带类型的条目数
组，plugin 是 boolean record），过早抽象只会把它们之间的差异掩盖掉。这里的
重复是有意的。

### Statusline 注入是对 Claude 的唯一副作用

`ccsp` 每次 launch 只写一个 settings 文件（位于 `<cwd>/.claude/.ccsp/tmp/`
的临时文件），永远不修改用户的 `~/.claude/settings.json`。Claude 看到的一切
——包括 statusline 上的 CCSP 标记—— 都来自这份合成后的临时文件以及它指向的
包装脚本。

**架构不变量：** `ccsp` 不修改 `~/.claude/` 下任何文件，也不修改
`<cwd>/.claude/settings*.json`，**唯一**例外是用户在 TUI 中确认"重新启用"
后触发的 `applyDisableRemovals`。原因：这些文件是用户的事实来源；`ccsp` 是
一层 *叠加* 而不是 *编辑器*。

### 会话连续性

`--continue` 与 `--resume <uuid>` 是一等公民：每次 launch 成功后都会以
Claude 的 session id 为键写一份 `SessionBinding`（预设名 + 开关状态 + 解析
出的 settings）；之后 `ccsp --resume` 不再走 TUI，直接重放同一份合成结果。
session id 由 spawn 前后对 `~/.claude/projects/<cwd>/*.jsonl` 做 diff 得出，
而不是注入 `--session-id`（Claude 在交互模式里会忽略它）。

**架构不变量：** `SessionBinding` 会被写两次：spawn 前（当调用者钉死了
`--session-id` 时）和 spawn 后（其它情况）。过期 binding —— jsonl 已不存在
—— 在每次 `--continue` 走列表时由 `resolveLiveBinding` 顺手剪掉。原因：即
便 `ccsp` 或 `claude` 被 `kill -9`，binding 存储也必须保证不会无限泄漏。

### 编译时 vs. 运行时

工程是纯 TypeScript，用 `tsc` 编译（参见
[`tsconfig.build.json`](tsconfig.build.json)）。发布产物是 `dist/cli.js` 及
其编译后的兄弟文件；`src/` 是开发树。`pnpm run generate-version` 会用
`package.json` 的版本号重新生成 [`src/version.ts`](src/version.ts)，让最终
产物在构建时就嵌好版本字符串，运行时无需再读 `package.json`。

**架构不变量：** 发到 npm 的只有 `dist/`（见 [`package.json`](package.json)
里的 `"files": ["dist", "package.json", "README.md", "LICENSE"]`）。测试文
件、fixture 与 TypeScript 源码不会被发布。

### 测试策略

测试在 [`tests/`](tests/) 下与 `src/` 一一对应。大致三层：

1. **单元：** 每个 `core/` 与 `services/` 文件都有匹配的
   `tests/{core,services}/*.test.ts`，对纯输入或临时目录做断言。
2. **Reducer：** [`tests/flows/*.test.ts`](tests/flows/) 直接对纯 flow
   reducer 注入事件序列 —— 不渲染 React，不挂 ink。
3. **组件 / CLI：** [`tests/ink/*.interaction.test.tsx`](tests/ink/) 用
   `react-test-renderer` 驱动 ink 组件；顶层
   [`tests/cli.test.ts`](tests/cli.test.ts) 等文件则借助一个 TTY 助手
   ([`tests/helpers/tty.ts`](tests/helpers/tty.ts)，背后是
   [`tests/helpers/tty_runner.py`](tests/helpers/tty_runner.py) 的 Python
   `pty` runner) 在真实 PTY 中跑编译后的 CLI。

**架构不变量：** flow reducer 的测试 **不会** 挂 ink。`flows/`（纯）与
`ink/`（渲染）的拆分正是为了让 `tests/flows/` 能直接做
`reduce(state, event)`。如果你为了测一个状态迁移而 render 一个 ink 组件，那
逻辑就应该被搬进 `flows/`。

### 错误处理

`CliError`（来自 [`src/core/errors.ts`](src/core/errors.ts)）是唯一的领域错
误类型，携带可选的 `exitCode`，方便把 Claude 的非 0 退出码原样向外透传。顶
层 `main` 捕获 `CliError` 并打印 `Error: <message>`；其它异常一律继续抛出，
保留 stack trace。

**架构不变量：** Service 只在用户能立即处理的情况下抛 `CliError`（预设找不
到、名字冲突、Claude 二进制缺失）。内部不变量被破坏时一律使用普通
`Error`，让它在开发期以崩溃方式暴露出来，不被悄悄吞掉。

### 跨平台脚注

statusline 包装脚本是 bash 脚本（`#!/usr/bin/env bash`，`set -euo pipefail`）。
在 Windows 上仍然会写脚本路径，依赖 Git Bash / WSL 提供 `bash`；
`claude-login` 的 keychain 检测被 `process.platform === 'darwin'` 守护。

**架构不变量：** `ccsp` 不打算支持 Windows PowerShell 作为 statusline 解释
器。原因：Windows 上的 Claude Code 本身就期望 bash 兼容的 statusline 命令。

## 不在本文范围

- **Claude Code 自身 settings schema 的形状** —— `ccsp` 把未知键当作不透明
  载荷处理。权威描述由 Claude Code 文档维护，本仓库镜像了一份在
  [`docs/references/claude-code-key-docs-directory.md`](docs/references/claude-code-key-docs-directory.md)。
- **发布管线** —— npm 与 Homebrew tap 流程见
  [`.github/workflows/release.yml`](.github/workflows/release.yml) 和
  [`scripts/brew-publish.sh`](scripts/brew-publish.sh)。
- **产品动机与 CLI 用法** —— 见 [`README.zh-hans.md`](README.zh-hans.md)
  与 [`README.md`](README.md)。
- **逐特性设计笔记** —— 推动各个特性落地的设计 spec 在
  [`docs/superpowers/plans/`](docs/superpowers/plans/) 与
  [`docs/superpowers/specs/`](docs/superpowers/specs/)。那是历史，不是架构。
