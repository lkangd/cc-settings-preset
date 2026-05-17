# cc-settings-preset 设计文档

## 背景

`cc-settings-preset` 提供 `ccsp` 命令，用于在启动 Claude Code 时选择一个运行时 settings 文件，并通过 `claude --settings <file>` 启动 Claude Code。

工具支持两类预设：

- 一级预设：合法的 Claude Code `settings.json` 完整配置文件。
- 二级预设：基于一级预设生成的完整配置文件，只表达 plugin 和 skill 开关差异。

## 架构与运行时约束

项目采用与 `cc-env` 类似的分层结构：

- `src/cli.ts`：Commander 命令入口和顶层启动逻辑。
- `src/core/*`：路径、schema、JSON IO、时间戳、错误、Claude 可执行文件查找、进程启动等基础能力。
- `src/services/*`：预设存储、一级/二级关系识别、二级同步、settings 发现、plugin 解析、skill 发现等业务逻辑。
- `src/flows/*`：create/run/manage 的状态流转。
- `src/ink/*`：Ink UI 组件和键盘输入映射。
- `tests/*`：schema、发现逻辑、预设匹配/同步、参数过滤和流程状态测试。

Node 12 运行时支持是硬约束。实现时需要调整当前 `package.json` 中偏 Node 20 的依赖和配置：

- 使用 Node 12 可运行的依赖版本。
- 避免 Node 12 不稳定或不可用的 ESM/runtime 特性。
- 构建产物需要能在 Node 12 环境运行。
- 验收不能只依赖当前本机 Node 版本，需要显式验证 Node 12 兼容性。

## 预设模型与存储

所有预设文件存储在：

```text
~/.ccsp/settings/
```

一级预设是从检测到或用户提供的 Claude Code settings JSON 导入的完整文件，命名为：

```text
[name]-settings.json
```

二级预设也是完整 settings JSON 文件，在用户修改 plugin 或 skill 开关后由一级预设生成，命名为：

```text
[parent-name]-[derived-name]-settings.json
```

为了避免把私有字段传给 `claude --settings`，一级/二级关系和元数据使用 sidecar 文件保存，例如：

```text
~/.ccsp/index.json
```

sidecar metadata 记录：

- 预设类型：一级或二级。
- 二级预设对应的父级一级预设。
- 创建时间和更新时间。
- 文件名或文件路径。

二级预设复用规则：

- 只比较同一父级下的 resolved `enabledPlugins` 和非 plugin `skillOverrides`。
- 如果已有二级预设的 toggle 组合一致，则复用该二级预设。
- 复用前仍然需要执行同步规则。

## 二级预设同步规则

一级预设是导入时的完整快照，不会自动跟随原始 Claude settings 文件变化。

二级预设每次使用前都要从父级一级预设同步一次：

1. 读取父级一级预设完整 JSON。
2. 读取二级预设当前 `enabledPlugins` 和 `skillOverrides`。
3. 以父级完整 JSON 作为基础。
4. 覆盖写回二级预设自己的 `enabledPlugins` 和 `skillOverrides`。
5. 其他字段全部以父级为准。
6. 使用同步后的二级预设路径启动 Claude Code。

这样二级预设始终继承父级最新的 `permissions`、`env`、`hooks`、`model` 等字段，只保留 plugin/skill 开关差异。

## 发现与开关语义

`ccsp` 只处理磁盘可访问的位置，不读取或修改 enterprise/managed settings。

settings 发现优先级从高到低：

1. `.claude/settings.local.json`
2. `.claude/settings.json`
3. `~/.claude/settings.json`

plugin 状态从这些文件中的 `enabledPlugins` 解析。冲突时按上述优先级解析成单个最终状态，UI 中每个 plugin 只显示一行。用户修改 plugin 开关后，生成的二级预设会把最终选择写入 `enabledPlugins`。

非 plugin skills 从以下位置发现：

- `~/.claude/skills/<skill-name>/SKILL.md`
- 当前项目 `.claude/skills/<skill-name>/SKILL.md`
- 适用的父级项目 `.claude/skills/<skill-name>/SKILL.md`
- `.claude/commands/*.md`，作为 skill 兼容条目；当同名 skill 和 command 同时存在时，skill 优先。

非 plugin skill 的关闭通过 `skillOverrides` 表达：

```json
{
  "skillOverrides": {
    "some-skill": "off"
  }
}
```

工具生成时主要写入 `"off"`。启用状态通常不需要显式写 `"on"`，除非需要清理或覆盖已有 override。

plugin 提供的 skills 不通过 `skillOverrides` 单独关闭。它们的可用性由父 plugin 控制：plugin 开启则 plugin skills 可用，plugin 关闭则 plugin skills 不可用。

## UI 与交互设计

默认 `ccsp` 启动后进入一级预设选择界面。界面采用三栏布局：

```text
┌ Settings ─────┐ ┌ Plugins ───────┐ ┌ Skills ─────────┐
│ ❯ base        │ │ ON  plugin-a   │ │ ON  skill-a     │
│   work        │ │ OFF plugin-b   │ │ OFF skill-b     │
└───────────────┘ └────────────────┘ └─────────────────┘
```

交互规则：

- 默认焦点在左侧 settings 列表。
- `↑/↓` 或 `k/j` 移动当前列表光标。
- 在一级预设界面按 `p` 进入 plugin 操作模式。
- 按 `s` 进入 skill 操作模式。
- 在 plugin/skill 模式下按空格切换当前项开关。
- 在 plugin 模式按 `s` 可切到 skill；在 skill 模式按 `p` 可切到 plugin。
- 在 plugin/skill 模式按 `esc` 返回 settings 列表。
- 在 settings 模式按 `enter`：
  - 如果本次没有改动 plugin/skill，且该一级预设存在历史二级预设，则进入二级预设选择界面。
  - 如果没有历史二级预设，则直接启动所选一级预设。
  - 如果本次有改动，则按 toggle 状态复用已有二级预设；找不到时进入二级预设命名流程。

二级预设列表也使用三栏视图：

- 左侧第一项是 `origin`，表示一级预设原始配置。
- 后续项是该一级预设派生出的二级预设。
- 中间和右侧展示该二级预设解析后的 plugin/skill 状态。
- 二级预设列表只允许选择，不允许按 `p`/`s` 修改开关。
- `esc` 返回一级预设列表。
- `enter` 启动选中的配置。

`ccsp manage` 复用相同三栏视图，但额外支持：

- `r`：重命名当前预设。
- `d`：删除当前预设。
- `l`：使用当前预设启动 Claude Code。

删除一级预设时，需要明确处理其二级预设，推荐让用户选择一并删除派生预设或保留为孤儿预设。

## 命令与参数处理

核心入口：

```bash
ccsp
ccsp create
ccsp manage
```

默认 `ccsp` 流程：

1. 读取 `~/.ccsp/settings/`。
2. 如果没有一级预设，进入自动 create 流程。
3. create 流程优先列出检测到的 Claude settings 文件：
   - `.claude/settings.local.json`
   - `.claude/settings.json`
   - `~/.claude/settings.json`
   - 手动输入 JSON 路径作为 fallback
4. 创建完成后回到一级预设列表。
5. 选择预设后退出 Ink UI，并使用 `cross-spawn` 启动：

```bash
claude --settings <selected-settings-path> ...
```

`ccsp claude ...` 规则：

- `claude` 关键字后面的参数透传给 Claude Code。
- 如果用户传入 `--settings` 或 `--settings=...`，ccsp 忽略该参数，并显示红色警告。
- ccsp 选择出的 settings 路径永远优先。

示例：

```bash
ccsp claude --resume xxx --settings=ignored
```

最终等价于：

```bash
claude --settings <selected-settings-path> --resume xxx
```

`ccsp create` 单独进入创建一级预设流程：

- 优先选择检测到的 settings 文件，也允许手动输入 JSON 路径。
- 校验必须是合法 JSON object。
- 让用户输入预设名称。
- 写入 `~/.ccsp/settings/[name]-settings.json`。

`ccsp manage` 进入管理 UI：

- 可管理一级和二级预设。
- 支持重命名、删除、启动。
- 重命名一级预设时，同步更新 sidecar metadata 中二级预设的 parent 引用。

## 校验与错误处理

使用 Zod 校验：

- settings 文件必须是 JSON object。
- `enabledPlugins` 如果存在，必须是 object，值按布尔值解析。
- `skillOverrides` 如果存在，必须是 object，值允许 Claude Code 支持的可见性值。
- 预设名称需要转换为安全文件名，避免路径穿越和非法字符。
- sidecar metadata 校验 parent/derived 关系、创建时间和文件名。

错误处理：

- JSON 无法解析：显示具体文件路径和解析错误。
- 预设名冲突：提示用户换名，或在 create/manage 中确认覆盖/重命名。
- 找不到 `claude` 可执行文件：提示安装 Claude Code 或检查 PATH。
- 传入 `--settings`：红色警告并忽略。
- 父级一级预设缺失但二级预设存在：标记为孤儿预设，允许在 manage 中删除或保留，但启动前提示无法同步父级字段。
- managed/enterprise settings：不读取、不修改，只提示当前工具仅处理磁盘可访问配置。

## 测试与验收标准

单元测试覆盖：

- settings JSON schema 校验。
- 预设文件名生成与安全名称转换。
- 一级/二级预设识别。
- sidecar metadata 读写。
- 二级预设 toggle 匹配逻辑。
- 二级预设使用前同步逻辑。
- `--settings` / `--settings=...` 参数过滤。
- plugin 解析优先级。
- 非 plugin skill 与 plugin skill 的开关语义。

流程测试覆盖：

- 没有一级预设时，默认 `ccsp` 进入 create 流程。
- 有一级预设且无二级预设时，选择后直接启动。
- 有一级预设且无改动时，进入二级预设列表。
- 有改动且 toggle 组合已存在时，复用二级预设。
- 有改动且 toggle 组合不存在时，创建新二级预设。
- 二级预设启动前同步父级字段。
- `ccsp claude ... --settings xxx` 忽略用户 settings 并保留其他 Claude 参数。

手工验收至少运行：

```bash
pnpm test
pnpm build
pnpm dev
pnpm dev claude --resume fake --settings ignored.json
pnpm dev create
pnpm dev manage
```

并确认：

- 三栏视图能正常导航。
- `p/s/space/esc/enter` 行为符合设计。
- 生成的 settings 文件可以传给 `claude --settings`。
- Node 12 兼容性通过实际运行或 CI/runtime 验证。
