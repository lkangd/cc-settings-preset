# 目标

从零开始，构建一个在运行时启动 claude code 命令时，指定 --settings 参数加载的运行时配置文件的命令行工具。

## 关键概念

### 一级预设

合法的 claude code settings.json，服务于 claude code 的 --settings 参数。

### 二级预设

基于一级预设创建的，专门用于管理 plugin 和 skill 的预设，主要是使用黑名单模式来屏蔽 plugin 和 skill，以达到不加载指定 plugin 和 skill 的作用。

## 使用方式

### 启动命令

```bash
# 启动 cc-settings-preset 的缩写命令：ccsp
# 启动后进入一级预设列表，如果没有任何一级预设，则自动进入 create 流程，跑完 create 流程后，再进入一级预设列表
# 进入一级预设列表后，展示一个现有的 settings 的三栏视图，左侧是 settings 列表，中间是 plugin 列表，展示每个 plugin 的开启和关闭状态，开启的放在上边，右侧是 skill 列表，展示每个 skill 的开启和关闭状态。中间视图和右侧视图，根据左侧当前选中的 settings 实时切换对应的配置
# 在 settings 选择界面，使用按钮 p 进入 plugin 实时操作模式，此时光标切换到 plugin 列表中，上下光标切换当前选择的 plugin，按空格键切换开启和关闭状态，按 esc 键返回到 settings 选择列表
# 在 settings 选择界面，使用按钮 s 进入 skill 实时操作模式，此时光标切换到 skill 列表中，上下光标切换当前选择的 skill，按空格键切换开启和关闭状态，按 esc 键返回到 settings 选择列表
# 注意，如果已经进入 plugin 列表中，按 s 亦可切换到 skill 列表中，在 skill 列表中按 p 可切换到 plugin 列表
# 确认后回车，如果 plugin 和 skill 发生了变动，基于选择的文件，copy 出来创建一个二级预设文件，让用户输入名称，不输入则使用 YYYY-MM-DD-HH-mm-ss 来自动命名，文件保存为 [name]-[new name]-settings.json，然后以这个最新的配置文件来启动。
# 在创建二级预设前，如果当前的 plugin 和 skill 组合已经被现有的二级预设文件相同，则不用进入创建二级预设的流程，直接以已经存在的二级预设进行启动
# 如果在当前选中的 settings 下没有操作过 plugin 和 skill 直接回车，如果存在历史创建的二级预设，则进入二级选择列表，展示模式跟一级一样，左中右三栏，其中第一栏是 origin，后续的就是其他的二级预设列表。如果不存在二级预设，则不用进入二级预设的相关流程
# 进入二级预设列表后，可以按 esc 建返回到一级预设列表，在二级预设列表，将不可再使用 p 和 s 来操作 plugin 和 skill 的开关
# 选定预设后，回车启动启动 claude code，后续等同于 claude --settings=[刚刚指定的配置路径]
ccsp

# 也可以启动的时候，接受 claude code 的其他参数，输入 claude 关键字，claude 关键字后面的参数都归属于 claude
# 以下命令启动后，选择完 settings 后，后续等同于 claude --settings=[刚刚指定的配置路径] --resume e8eb7b78-c35a-4f60-ab52-6ce7825e86a0
ccsp claude --resume e8eb7b78-c35a-4f60-ab52-6ce7825e86a0

# 注意 --settings 是 ccsp 保留的参数，以下命令指定的 --settings 将会被忽略，此时需要弹出一个红色的告警提示，入参 --settings 将会被忽略
ccsp claude --resume e8eb7b78-c35a-4f60-ab52-6ce7825e86a0 --settings=[显示指定的 settings]
```

注意，claude code 是通过自动机制来发现 skill 的，因此进入一级预设列表后，skill 的可见范围为(官方说明)：

```text
你存储 skill 的位置决定了谁可以使用它：
位置 路径 适用于
企业 请参阅托管设置 你的组织中的所有用户
个人 ~/.claude/skills/<skill-name>/SKILL.md 你的所有项目
项目 .claude/skills/<skill-name>/SKILL.md 仅此项目
插件 <plugin>/skills/<skill-name>/SKILL.md 启用插件的位置
当 skills 在各个级别共享相同的名称时，企业覆盖个人，个人覆盖项目。插件 skills 使用 plugin-name:skill-name 命名空间，因此它们不能与其他级别冲突。如果你在 .claude/commands/ 中有文件，它们的工作方式相同，但如果 skill 和命令共享相同的名称，skill 优先。
```

因此，需要先去遍历这些位置，来确定 skill 的列表。如果有明确禁用的 skill，使用“从设置覆盖 skill 可见性”（见下方参考文档）设置禁用 skill：

```json
{
  "skillOverrides": {
    "some-skill": "off"
  }
}
```

而 plugin 的可选列表，从以下配置文件的 enabledPlugins 字段来决定(优先级从高到低)：
1、本地项目设置（.claude/settings.local.json）个人项目特定设置
2、共享项目设置（.claude/settings.json）源代码管理中的团队共享项目设置
3、用户设置（~/.claude/settings.json）个人全局设置

因此，需要遍历这些 settings 的 enabledPlugins 字段，然后根据优先级来确定 plugin 的列表。如果有明确禁用的 plugin，使用 false 字段来禁用 plugin：

```json
{
  "enabledPlugins": {
    "some-plugin": false
  }
}

```

### 创建一级预设

```bash
# 以下命令启动后，让用户输入一个 json 文件路径，需要校验为合法的 json 文件，回车确认，然后让用户输入预设名称
# 确认后文件保存到 ~/.ccsp/settings/[name]-settings.json
ccsp create
```

### 管理预设

```bash
# 执行后进入一级预设列表，回车后进入二级预设列表，大致流程和 ccsp 启动的流程类似，增加以下操作：
# 按 r 对预设进行改名
# 按 d 快捷键，删除预设
# 按 l 快捷键以当前所选预设进行启动
ccsp manage
```

## 其他要求

### 技术栈

使用 @package.json#L39-65 声明的技术栈来进行开发：

- 使用 ink 来做界面展示和交互
- 使用 commander 来创建和管理命令
- 使用 zod 来做数据结构校验和限制

可视具体情况，按需安装新的模块依赖。

### 架构

可参考 cc-env 项目：/Users/liangkangda/Fe-project/code/cc-env/src

### 运行环境要求

需要满足最低 nodejs 运行版本为 12 及以上

## 参考文档

### claude code

- claude code 官方 settings 说明文档：<https://code.claude.com/docs/en/settings>
- Skills 的位置：<https://code.claude.com/docs/zh-CN/skills#skills-%E7%9A%84%E4%BD%8D%E7%BD%AE>
- 从设置覆盖 skill 可见性：<https://code.claude.com/docs/zh-CN/skills#override-skill-visibility-from-settings>
